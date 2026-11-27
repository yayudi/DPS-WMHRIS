package usecase

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/parser"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

const (
	maxExternalImageBytes     = 20 << 20 // 20 MB cap to prevent OOM on remote hotlinks
	externalImageHTTPTimeout  = 30 * time.Second
	storageUploadHTTPTimeout  = 60 * time.Second
	maxExternalImageRedirects = 5
)

// MediaService aliases the hexagonal inbound port for backward compatibility.
type MediaService = port.MediaService

// DuplicateError aliases domain.DuplicateMediaError for backward compatibility.
type DuplicateError = domain.DuplicateMediaError

type mediaServiceImpl struct {
	txManager      database.TransactionManager
	mediaRepo      port.MediaRepository
	productRepo    catalog_port.ProductRepository
	storageService port.StorageService
}

// NewMediaService constructs a MediaService with transaction, repository, product, and storage dependencies.
func NewMediaService(txManager database.TransactionManager, mediaRepo port.MediaRepository, productRepo catalog_port.ProductRepository, storageService port.StorageService) port.MediaService {
	return &mediaServiceImpl{
		txManager:      txManager,
		mediaRepo:      mediaRepo,
		productRepo:    productRepo,
		storageService: storageService,
	}
}

// SaveMediaMetadata checks hash deduplication and inserts a completed media asset record.
func (s *mediaServiceImpl) SaveMediaMetadata(ctx context.Context, asset system_dto.ConfirmUploadAsset, userID int) (int, error) {
	if asset.Hash != "" {
		existingID, err := s.mediaRepo.GetMediaAssetByHash(ctx, asset.Hash)
		if err == nil && existingID != nil {
			return 0, DuplicateError{DuplicateOf: *existingID}
		}
	}

	payload := map[string]any{
		"title":         asset.Title,
		"mainPath":      asset.MainPath,
		"thumbnailPath": asset.ThumbnailPath,
		"status":        "COMPLETED",
		"uploaderId":    userID,
		"tags":          asset.Tags,
		"hash":          asset.Hash,
		"duplicateOf":   nil,
		"sizeBytes":     asset.SizeBytes,
		"width":         asset.Width,
		"height":        asset.Height,
	}

	return s.mediaRepo.CreateMediaAsset(ctx, payload)
}

// GetMediaAssets returns a paginated list of media assets matching the supplied filter.
func (s *mediaServiceImpl) GetMediaAssets(ctx context.Context, page, limit int, filter system_dto.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error) {
	return s.mediaRepo.GetMediaAssets(ctx, page, limit, filter)
}

// GetMediaDetailsWithProducts returns a single media asset enriched with linked products.
func (s *mediaServiceImpl) GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error) {
	return s.mediaRepo.GetMediaDetailsWithProducts(ctx, mediaID)
}

// GetMediaAssetsByIDs returns media status summaries for the requested asset IDs.
func (s *mediaServiceImpl) GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]system_dto.MediaAssetResponse, error) {
	return s.mediaRepo.GetMediaAssetsByIDs(ctx, mediaIDs)
}

// DeleteMediaAsset deletes a media asset record from the database and returns its R2 object keys.
func (s *mediaServiceImpl) DeleteMediaAsset(ctx context.Context, mediaID int) (string, string, error) {
	asset, err := s.mediaRepo.GetMediaAssetByID(ctx, mediaID)
	if err != nil || asset == nil {
		return "", "", apperror.NotFound("settings.media.asset_not_found", "aset tidak ditemukan")
	}

	// Delete from DB (will fail with FK violation if referenced by product_images)
	if err := s.mediaRepo.DeleteMediaAsset(ctx, mediaID); err != nil {
		return "", "", err
	}

	thumbPath := ""
	if asset.ThumbnailPath != nil {
		thumbPath = *asset.ThumbnailPath
	}

	return asset.MainPath, thumbPath, nil
}

// InsertTrashQueue records an R2 object key for deferred background deletion.
func (s *mediaServiceImpl) InsertTrashQueue(ctx context.Context, r2Key string) error {
	if r2Key == "" {
		return nil
	}
	return s.mediaRepo.InsertTrashQueue(ctx, r2Key)
}

// UpdateMediaTags replaces the tags of a media asset inside a transaction.
func (s *mediaServiceImpl) UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		return s.mediaRepo.UpdateMediaTags(ctx, mediaID, tags)
	})
}

// UpdateMediaTitle updates the display title of a media asset inside a transaction.
func (s *mediaServiceImpl) UpdateMediaTitle(ctx context.Context, mediaID int, title string) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		return s.mediaRepo.UpdateMediaTitle(ctx, mediaID, title)
	})
}

// ProcessMediaLinkImport parses an uploaded Excel workbook and links SKUs to existing or remote media assets.
func (s *mediaServiceImpl) ProcessMediaLinkImport(ctx context.Context, filePath string, userID int) (string, error) {
	filePath = utils.ResolveStoragePath(filePath)
	records, err := parser.ReadExcelFile(filePath)
	if err != nil {
		return "", err
	}

	if len(records) == 0 {
		return "", apperror.Validation("settings.media.column_format_empty", "format kolom tidak sesuai (kosong)")
	}

	var skuKey, titleKey string
	for k := range records[0] {
		val := strings.ToLower(strings.TrimSpace(k))
		if val == "sku" {
			skuKey = k
		}
		if val == "image_title" || val == "image_filename" || val == "image" ||
			val == "media_title" || val == "image_url" || val == "image_link" || val == "url" {
			titleKey = k
		}
	}

	if skuKey == "" || titleKey == "" {
		return "", apperror.Validation("settings.media.column_format_invalid", "format kolom tidak sesuai. Pastikan ada kolom 'SKU' dan 'Image_URL'")
	}

	successCount := 0
	failCount := 0
	var errorsList []string

	for rowIndex, record := range records {
		lineNum := rowIndex + 2 // row 1 is the Excel header

		sku := strings.TrimSpace(record[skuKey])
		imageRef := strings.TrimSpace(record[titleKey])

		if sku == "" || imageRef == "" {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d dilewati: SKU atau Link kosong", lineNum))
			continue
		}

		products, err := s.productRepo.GetBySKUs(ctx, []string{sku})
		if err != nil || len(products) == 0 {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: Produk dengan SKU %s tidak ditemukan", lineNum, sku))
			failCount++
			continue
		}
		productID := products[0].ID

		var mediaID int
		var found bool

		lowerRef := strings.ToLower(imageRef)
		isHotlink := strings.HasPrefix(lowerRef, "http://") || strings.HasPrefix(lowerRef, "https://")

		if isHotlink {
			mID, err := s.processExternalImage(ctx, imageRef, userID)
			if err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d: Gagal proses hotlink '%s': %v", lineNum, imageRef, err))
				failCount++
				continue
			}
			mediaID = mID
			found = true
		} else {
			searchPath := imageRef
			if strings.Contains(searchPath, "/") {
				parts := strings.Split(searchPath, "/")
				searchPath = parts[len(parts)-1]
			}
			searchPath = strings.Split(searchPath, "?")[0]
			searchPath = strings.Split(searchPath, "#")[0]

			mID, err := s.mediaRepo.FindMediaIDByPathLike(ctx, searchPath)
			if err == nil && mID != nil {
				mediaID = *mID
				found = true
			}
		}

		if !found {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: Media '%s' tidak ditemukan", lineNum, imageRef))
			failCount++
			continue
		}

		linked, err := s.productRepo.IsMediaLinkedToProduct(ctx, productID, mediaID)
		if err == nil && !linked {
			err = s.productRepo.LinkMediaToProduct(ctx, productID, mediaID, 0)
			if err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d: Gagal link media ke produk: %v", lineNum, err))
				failCount++
				continue
			}
		}
		successCount++
	}

	summary := i18n.T(ctx, "settings.media.import_summary", map[string]any{
		"success": successCount,
		"failed":  failCount,
	})
	if summary == "settings.media.import_summary" {
		summary = fmt.Sprintf("Berhasil: %d, Gagal: %d.", successCount, failCount)
	}
	if len(errorsList) > 0 {
		summary += " Error: " + strings.Join(errorsList, " | ")
	}
	return summary, nil
}

// isBlockedExternalIP rejects loopback, private RFC1918/ULA, link-local (including cloud metadata 169.254.169.254),
// unspecified, and multicast IP addresses to prevent SSRF attacks.
func isBlockedExternalIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

// ValidateExternalImageURL checks scheme and resolved IPs before fetching a remote image URL.
func ValidateExternalImageURL(ctx context.Context, rawURL string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, fmt.Errorf("URL tidak valid: %w", err)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("skema URL '%s' tidak diizinkan", parsed.Scheme)
	}
	host := parsed.Hostname()
	if host == "" {
		return nil, errors.New("hostname URL kosong")
	}
	if strings.EqualFold(host, "localhost") {
		return nil, errors.New("akses ke host internal tidak diizinkan")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedExternalIP(ip) {
			return nil, fmt.Errorf("akses ke alamat IP internal %s tidak diizinkan", ip.String())
		}
		return parsed, nil
	}

	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(ips) == 0 {
		return nil, fmt.Errorf("gagal resolve hostname '%s'", host)
	}
	for _, addr := range ips {
		if isBlockedExternalIP(addr.IP) {
			return nil, fmt.Errorf("akses ke alamat IP internal %s tidak diizinkan", addr.IP.String())
		}
	}
	return parsed, nil
}

func newSafeExternalHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("gagal resolve host %s", host)
			}
			for _, addr := range ips {
				if isBlockedExternalIP(addr.IP) {
					return nil, fmt.Errorf("koneksi ke IP internal %s diblokir", addr.IP.String())
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}

	return &http.Client{
		Timeout:   externalImageHTTPTimeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxExternalImageRedirects {
				return errors.New("terlalu banyak redirect")
			}
			_, err := ValidateExternalImageURL(req.Context(), req.URL.String())
			return err
		},
	}
}

func (s *mediaServiceImpl) processExternalImage(ctx context.Context, imageURL string, userID int) (int, error) {
	parsedURL, err := ValidateExternalImageURL(ctx, imageURL)
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return 0, err
	}

	client := newSafeExternalHTTPClient()
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxExternalImageBytes+1))
	if err != nil {
		return 0, err
	}
	if len(data) > maxExternalImageBytes {
		return 0, fmt.Errorf("ukuran file melebihi batas %d MB", maxExternalImageBytes/(1<<20))
	}

	hashBytes := sha256.Sum256(data)
	hashStr := hex.EncodeToString(hashBytes[:])

	existingID, err := s.mediaRepo.GetMediaAssetByHash(ctx, hashStr)
	if err == nil && existingID != nil {
		return *existingID, nil
	}

	filename := filepath.Base(parsedURL.Path)
	if filename == "" || filename == "." || filename == "/" {
		filename = fmt.Sprintf("downloaded_%d.jpg", time.Now().Unix())
	}
	mimeType := http.DetectContentType(data)

	mainURL, mainKey, _, err := s.storageService.GeneratePresignedUploadUrl(ctx, filename, mimeType, "main")
	if err != nil {
		return 0, err
	}

	putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, mainURL, bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("gagal menyiapkan request upload ke storage: %w", err)
	}
	putReq.Header.Set("Content-Type", mimeType)

	uploadClient := &http.Client{Timeout: storageUploadHTTPTimeout}
	putResp, err := uploadClient.Do(putReq)
	if err != nil {
		return 0, fmt.Errorf("gagal upload ke storage: %w", err)
	}
	defer putResp.Body.Close()

	if putResp.StatusCode < http.StatusOK || putResp.StatusCode >= http.StatusMultipleChoices {
		return 0, fmt.Errorf("gagal upload ke storage (status %d)", putResp.StatusCode)
	}

	payload := map[string]any{
		"title":         filename,
		"mainPath":      mainKey,
		"thumbnailPath": nil,
		"status":        "COMPLETED",
		"uploaderId":    userID,
		"tags":          []string{"hotlink_import"},
		"hash":          hashStr,
		"duplicateOf":   nil,
		"sizeBytes":     len(data),
		"width":         0,
		"height":        0,
	}

	return s.mediaRepo.CreateMediaAsset(ctx, payload)
}

func parseProductIDs(products any) []int {
	if products == nil {
		return nil
	}
	var rawIDs []int
	switch v := products.(type) {
	case int:
		rawIDs = append(rawIDs, v)
	case float64:
		rawIDs = append(rawIDs, int(v))
	case []int:
		rawIDs = append(rawIDs, v...)
	case []any:
		for _, item := range v {
			switch n := item.(type) {
			case float64:
				rawIDs = append(rawIDs, int(n))
			case int:
				rawIDs = append(rawIDs, n)
			}
		}
	}

	seen := make(map[int]struct{}, len(rawIDs))
	deduped := make([]int, 0, len(rawIDs))
	for _, id := range rawIDs {
		if id <= 0 {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		deduped = append(deduped, id)
	}
	return deduped
}

// SaveMediaBatch persists a batch of uploaded media assets and links them to any specified products atomically.
func (s *mediaServiceImpl) SaveMediaBatch(ctx context.Context, assets []system_dto.ConfirmUploadAsset, products any, userID int) ([]map[string]any, error) {
	prodIDs := parseProductIDs(products)
	uploadedAssets := make([]map[string]any, 0, len(assets))

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		for _, asset := range assets {
			mediaID, err := s.SaveMediaMetadata(txCtx, asset, userID)
			if err != nil {
				return err
			}

			for _, pID := range prodIDs {
				linked, linkCheckErr := s.productRepo.IsMediaLinkedToProduct(txCtx, pID, mediaID)
				if linkCheckErr != nil {
					return linkCheckErr
				}
				if !linked {
					if txErr := s.productRepo.LinkMediaToProduct(txCtx, pID, mediaID, 0); txErr != nil {
						return txErr
					}
				}
			}

			uploadedAssets = append(uploadedAssets, map[string]any{
				"id":           mediaID,
				"originalName": asset.Title,
				"status":       "COMPLETED",
			})
		}
		return nil
	})
	return uploadedAssets, err
}

// DeleteMediaAndQueueTrash deletes a media asset and enqueues its R2 keys into r2_trash_queue atomically.
func (s *mediaServiceImpl) DeleteMediaAndQueueTrash(ctx context.Context, mediaID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		mainPath, thumbPath, err := s.DeleteMediaAsset(ctx, mediaID)
		if err != nil {
			return err
		}
		if err := s.InsertTrashQueue(ctx, mainPath); err != nil {
			return err
		}
		if err := s.InsertTrashQueue(ctx, thumbPath); err != nil {
			return err
		}
		return nil
	})
}

// GenerateBulkLinkTemplate creates an Excel workbook template for bulk linking media assets to product SKUs.
func (s *mediaServiceImpl) GenerateBulkLinkTemplate() *excelize.File {
	f := excelize.NewFile()
	sheetName := "Template Tautkan Media"
	_ = f.SetSheetName("Sheet1", sheetName) // #nosec G104

	styles := utils.InitExcelStyles(f)
	utils.SetHeaders(f, sheetName, []string{"SKU", "Image_URL"}, styles.Header)
	utils.SetColWidths(f, sheetName, map[string]float64{"A": 20, "B": 50})

	baseURL := strings.TrimRight(config.AppConfig.R2PublicURL, "/")

	sample1 := "main/sample-product-1.webp"
	sample2 := "main/sample-product-2.png"
	if baseURL != "" {
		sample1 = baseURL + "/" + sample1
		sample2 = baseURL + "/" + sample2
	}

	_ = f.SetSheetRow(sheetName, "A2", &[]any{"SKU-SAMPLE-001", sample1}) // #nosec G104
	_ = f.SetSheetRow(sheetName, "A3", &[]any{"SKU-SAMPLE-002", sample2}) // #nosec G104
	return f
}
