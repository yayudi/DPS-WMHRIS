package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/jmoiron/sqlx"
	"github.com/xuri/excelize/v2"
)

type MediaService interface {
	SaveMediaMetadata(ctx context.Context, tx sqlx.ExtContext, asset dto.ConfirmUploadAsset, userID int) (int, error)
	GetMediaAssets(ctx context.Context, page, limit int, filter repository.MediaFilter) (utils.PaginatedResult[dto.MediaAssetResponse], error)
	GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error)
	GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]dto.MediaAssetResponse, error)
	DeleteMediaAsset(ctx context.Context, tx sqlx.ExtContext, mediaID int) (mainPath string, thumbPath string, err error)
	InsertTrashQueue(ctx context.Context, tx sqlx.ExtContext, r2Key string) error
	UpdateMediaTags(ctx context.Context, tx sqlx.ExtContext, mediaID int, tags []string) error
	UpdateMediaTitle(ctx context.Context, tx sqlx.ExtContext, mediaID int, title string) error
	ProcessMediaLinkImport(ctx context.Context, filePath string, userID int) (string, error)
}

type mediaServiceImpl struct {
	db             *sqlx.DB
	mediaRepo      repository.MediaRepository
	productRepo    repository.ProductRepository
	storageService StorageService
}

func NewMediaService(db *sqlx.DB, mediaRepo repository.MediaRepository, productRepo repository.ProductRepository, storageService StorageService) MediaService {
	return &mediaServiceImpl{
		db:             db,
		mediaRepo:      mediaRepo,
		productRepo:    productRepo,
		storageService: storageService,
	}
}

// DuplicateError is a custom error indicating the media hash already exists
type DuplicateError struct {
	DuplicateOf int
}

func (e DuplicateError) Error() string {
	return fmt.Sprintf("Duplicate media of %d", e.DuplicateOf)
}

func (s *mediaServiceImpl) SaveMediaMetadata(ctx context.Context, tx sqlx.ExtContext, asset dto.ConfirmUploadAsset, userID int) (int, error) {
	// Duplicate detection
	existingID, err := s.mediaRepo.GetMediaAssetByHash(ctx, asset.Hash)
	if err == nil && existingID != nil {
		return 0, DuplicateError{DuplicateOf: *existingID}
	}

	payload := map[string]interface{}{
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

	return s.mediaRepo.CreateMediaAsset(ctx, tx, payload)
}

func (s *mediaServiceImpl) GetMediaAssets(ctx context.Context, page, limit int, filter repository.MediaFilter) (utils.PaginatedResult[dto.MediaAssetResponse], error) {
	return s.mediaRepo.GetMediaAssets(ctx, page, limit, filter)
}

func (s *mediaServiceImpl) GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*dto.MediaAssetResponse, error) {
	return s.mediaRepo.GetMediaDetailsWithProducts(ctx, mediaID)
}

func (s *mediaServiceImpl) GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]dto.MediaAssetResponse, error) {
	return s.mediaRepo.GetMediaAssetsByIDs(ctx, mediaIDs)
}

func (s *mediaServiceImpl) DeleteMediaAsset(ctx context.Context, tx sqlx.ExtContext, mediaID int) (string, string, error) {
	asset, err := s.mediaRepo.GetMediaAssetByID(ctx, mediaID)
	if err != nil || asset == nil {
		return "", "", fmt.Errorf("Aset tidak ditemukan")
	}

	// Delete from DB (will throw if FK restrict hits)
	// We use the transactional connection passed here or fallback
	dbExec := tx
	_, err = dbExec.ExecContext(ctx, "DELETE FROM media_assets WHERE id = ?", mediaID)
	if err != nil {
		return "", "", err
	}

	thumbPath := ""
	if asset.ThumbnailPath != nil {
		thumbPath = *asset.ThumbnailPath
	}

	return asset.MainPath, thumbPath, nil
}

func (s *mediaServiceImpl) InsertTrashQueue(ctx context.Context, tx sqlx.ExtContext, r2Key string) error {
	if r2Key == "" {
		return nil
	}
	_, err := tx.ExecContext(ctx, "INSERT INTO r2_trash_queue (r2_key) VALUES (?)", r2Key)
	return err
}

func (s *mediaServiceImpl) UpdateMediaTags(ctx context.Context, tx sqlx.ExtContext, mediaID int, tags []string) error {
	return s.mediaRepo.UpdateMediaTags(ctx, mediaID, tags) // Using simple repo call, tx if needed can be added
}

func (s *mediaServiceImpl) UpdateMediaTitle(ctx context.Context, tx sqlx.ExtContext, mediaID int, title string) error {
	return s.mediaRepo.UpdateMediaTitle(ctx, mediaID, title)
}

func (s *mediaServiceImpl) ProcessMediaLinkImport(ctx context.Context, filePath string, userID int) (string, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return "", fmt.Errorf("gagal membuka file excel: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return "", fmt.Errorf("file excel tidak memiliki sheet")
	}

	sheetName := sheets[0]
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return "", fmt.Errorf("gagal membaca baris: %w", err)
	}

	if len(rows) < 2 {
		return "", fmt.Errorf("format kolom tidak sesuai (kosong)")
	}

	skuCol := -1
	titleCol := -1

	for colIndex, cellValue := range rows[0] {
		val := strings.ToLower(strings.TrimSpace(cellValue))
		if val == "sku" {
			skuCol = colIndex
		}
		if val == "image_title" || val == "image_filename" || val == "image" ||
			val == "media_title" || val == "image_url" || val == "image_link" || val == "url" {
			titleCol = colIndex
		}
	}

	if skuCol == -1 || titleCol == -1 {
		return "", fmt.Errorf("format kolom tidak sesuai. Pastikan ada kolom 'SKU' dan 'Image_URL'")
	}

	successCount := 0
	failCount := 0
	var errorsList []string

	for rowIndex := 1; rowIndex < len(rows); rowIndex++ {
		row := rows[rowIndex]
		if len(row) <= skuCol || len(row) <= titleCol {
			continue
		}

		sku := strings.TrimSpace(row[skuCol])
		imageRef := strings.TrimSpace(row[titleCol])

		if sku == "" || imageRef == "" {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d dilewati: SKU atau Link kosong", rowIndex+1))
			continue
		}

		products, err := s.productRepo.GetBySKUs(ctx, []string{sku})
		if err != nil || len(products) == 0 {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: Produk dengan SKU %s tidak ditemukan", rowIndex+1, sku))
			failCount++
			continue
		}
		productID := products[0].ID

		var mediaID int
		var found bool

		isHotlink := strings.HasPrefix(strings.ToLower(imageRef), "http://") || strings.HasPrefix(strings.ToLower(imageRef), "https://")

		if isHotlink {
			mID, err := s.processExternalImage(ctx, imageRef, userID)
			if err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d: Gagal proses hotlink '%s': %v", rowIndex+1, imageRef, err))
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

			var mID int
			err := s.db.GetContext(ctx, &mID, "SELECT id FROM media_assets WHERE main_path LIKE ? OR thumbnail_path LIKE ? LIMIT 1", "%"+searchPath+"%", "%"+searchPath+"%")
			if err == nil {
				mediaID = mID
				found = true
			}
		}

		if !found {
			errorsList = append(errorsList, fmt.Sprintf("Baris %d: Media '%s' tidak ditemukan", rowIndex+1, imageRef))
			failCount++
			continue
		}

		var existingCount int
		err = s.db.GetContext(ctx, &existingCount, "SELECT COUNT(*) FROM product_images WHERE product_id = ? AND media_id = ?", productID, mediaID)
		if err == nil && existingCount == 0 {
			err = s.productRepo.LinkMediaToProduct(ctx, s.db, productID, mediaID, 0)
			if err != nil {
				errorsList = append(errorsList, fmt.Sprintf("Baris %d: Gagal link media ke produk: %v", rowIndex+1, err))
				failCount++
				continue
			}
		}
		successCount++
	}

	summary := fmt.Sprintf("Berhasil: %d, Gagal: %d.", successCount, failCount)
	if len(errorsList) > 0 {
		summary += " Error: " + strings.Join(errorsList, " | ")
	}
	return summary, nil
}

func (s *mediaServiceImpl) processExternalImage(ctx context.Context, imageURL string, userID int) (int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return 0, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	hashBytes := sha256.Sum256(data)
	hashStr := hex.EncodeToString(hashBytes[:])

	existingID, err := s.mediaRepo.GetMediaAssetByHash(ctx, hashStr)
	if err == nil && existingID != nil {
		return *existingID, nil
	}

	parsedUrl, _ := url.Parse(imageURL)
	filename := filepath.Base(parsedUrl.Path)
	if filename == "" || filename == "." || filename == "/" {
		filename = fmt.Sprintf("downloaded_%d.jpg", time.Now().Unix())
	}
	mimeType := http.DetectContentType(data)

	mainUrl, mainKey, _, err := s.storageService.GeneratePresignedUploadUrl(ctx, filename, mimeType, "main")
	if err != nil {
		return 0, err
	}

	putReq, _ := http.NewRequestWithContext(ctx, "PUT", mainUrl, bytes.NewReader(data))
	putReq.Header.Set("Content-Type", mimeType)
	putResp, err := http.DefaultClient.Do(putReq)
	if err != nil {
		return 0, fmt.Errorf("gagal upload ke storage")
	}
	defer putResp.Body.Close()
	
	if putResp.StatusCode != 200 {
		return 0, fmt.Errorf("gagal upload ke storage (status %d)", putResp.StatusCode)
	}

	payload := map[string]interface{}{
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

	return s.mediaRepo.CreateMediaAsset(ctx, s.db, payload)
}
