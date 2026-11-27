package usecase

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	catalog_parser "github.com/dps-wmhris/backend/internal/modules/catalog/application/parser"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

const defaultTimelineLimit = 100

type productServiceImpl struct {
	txManager    database.TransactionManager
	productRepo  catalog_port.ProductRepository
	auditRepo    catalog_port.ProductAuditRepository
	categoryRepo catalog_port.CategoryRepository
}

// NewProductUseCase creates a ProductUseCase wired with transaction management and catalog persistence ports.
func NewProductUseCase(
	txManager database.TransactionManager,
	productRepo catalog_port.ProductRepository,
	auditRepo catalog_port.ProductAuditRepository,
	categoryRepo catalog_port.CategoryRepository,
) catalog_port.ProductUseCase {
	return &productServiceImpl{
		txManager:    txManager,
		productRepo:  productRepo,
		auditRepo:    auditRepo,
		categoryRepo: categoryRepo,
	}
}

func buildPackageComponents(packageProductID int, inputs []catalog_dto.ProductComponentInput) ([]domain.PackageComponent, error) {
	if len(inputs) == 0 {
		return []domain.PackageComponent{}, nil
	}

	qtyByCompID := make(map[int]int, len(inputs))
	order := make([]int, 0, len(inputs))
	for _, in := range inputs {
		compID := in.ResolvedComponentID()
		if compID <= 0 {
			return nil, apperror.Validation("master_data.product.err_invalid_component", "Komponen paket tidak valid")
		}
		if packageProductID > 0 && compID == packageProductID {
			return nil, apperror.Validation("master_data.product.err_self_component", "Produk tidak dapat menjadi komponen dirinya sendiri")
		}
		if in.Quantity <= 0 {
			return nil, apperror.Validation("master_data.product.err_invalid_component_qty", "Jumlah komponen paket harus lebih dari 0")
		}
		if _, exists := qtyByCompID[compID]; !exists {
			order = append(order, compID)
		}
		qtyByCompID[compID] += in.Quantity
	}

	result := make([]domain.PackageComponent, 0, len(order))
	for _, compID := range order {
		result = append(result, domain.PackageComponent{
			PackageProductID:   packageProductID,
			ComponentProductID: compID,
			QuantityPerPackage: qtyByCompID[compID],
		})
	}
	return result, nil
}

func (s *productServiceImpl) CreateProduct(ctx context.Context, userID int, req catalog_dto.CreateProductRequest) (*domain.Product, error) {
	sku := strings.TrimSpace(req.SKU)
	name := strings.TrimSpace(req.Name)
	if sku == "" || name == "" {
		return nil, domain.ErrInvalidProductPayload
	}
	if err := domain.ValidateProductMetrics(req.Price, req.Weight, req.Length, req.Width, req.Height); err != nil {
		return nil, err
	}

	product := &domain.Product{
		SKU:        sku,
		Name:       name,
		CategoryID: req.CategoryID,
		Price:      req.Price,
		IsActive:   true,
		IsPackage:  req.IsPackage,
		Weight:     req.Weight,
		Length:     req.Length,
		Width:      req.Width,
		Height:     req.Height,
	}

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.productRepo.Create(txCtx, product); err != nil {
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateSKU
			}
			return err
		}

		if req.IsPackage && len(req.Components) > 0 {
			comps, err := buildPackageComponents(product.ID, req.Components)
			if err != nil {
				return err
			}
			if err := s.productRepo.ReplacePackageComponents(txCtx, product.ID, comps); err != nil {
				return err
			}
		}

		auditLog := &domain.ProductAuditLog{
			ProductID: product.ID,
			UserID:    &userID,
			Action:    domain.ProductAuditActionCreate,
		}
		return s.auditRepo.Create(txCtx, auditLog)
	})
	if err != nil {
		return nil, err
	}

	return product, nil
}

func (s *productServiceImpl) UpdateProduct(ctx context.Context, userID int, productID int, req catalog_dto.UpdateProductRequest) error {
	sku := strings.TrimSpace(req.SKU)
	name := strings.TrimSpace(req.Name)

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		// Handle Restore logic (PUT /products/:id with is_active=true and empty name)
		if req.IsActive != nil && *req.IsActive && name == "" {
			if err := s.productRepo.Restore(txCtx, productID); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return domain.ErrProductNotFound
				}
				return err
			}
			auditLog := &domain.ProductAuditLog{
				ProductID: productID,
				UserID:    &userID,
				Action:    domain.ProductAuditActionRestore,
			}
			return s.auditRepo.Create(txCtx, auditLog)
		}

		if sku == "" {
			return domain.ErrInvalidProductPayload
		}
		if err := domain.ValidateProductMetrics(req.Price, req.Weight, req.Length, req.Width, req.Height); err != nil {
			return err
		}

		existing, err := s.productRepo.FindByID(txCtx, productID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductNotFound
			}
			return err
		}

		// Preserve existing name when omitted on non-restore updates; reject blank name if no existing record was loaded.
		if name == "" {
			if existing != nil && strings.TrimSpace(existing.Name) != "" {
				name = existing.Name
			} else {
				return domain.ErrInvalidProductPayload
			}
		}

		isActive := true
		if req.IsActive != nil {
			isActive = *req.IsActive
		} else if existing != nil {
			isActive = existing.IsActive
		}

		var comps []domain.PackageComponent
		shouldSyncComponents := false
		if !req.IsPackage {
			shouldSyncComponents = true
		} else if req.Components != nil {
			comps, err = buildPackageComponents(productID, *req.Components)
			if err != nil {
				return err
			}
			shouldSyncComponents = true
		}

		product := &domain.Product{
			BaseEntity: kernel.BaseEntity{ID: productID},
			SKU:        sku,
			Name:       name,
			CategoryID: req.CategoryID,
			Price:      req.Price,
			IsPackage:  req.IsPackage,
			IsActive:   isActive,
			Weight:     req.Weight,
			Length:     req.Length,
			Width:      req.Width,
			Height:     req.Height,
		}

		if err := s.productRepo.Update(txCtx, product); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductNotFound
			}
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateSKU
			}
			return err
		}

		if shouldSyncComponents {
			if err := s.productRepo.ReplacePackageComponents(txCtx, productID, comps); err != nil {
				return err
			}
		}

		auditLog := &domain.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    domain.ProductAuditActionUpdate,
		}
		return s.auditRepo.Create(txCtx, auditLog)
	})
}

func (s *productServiceImpl) DeleteProduct(ctx context.Context, userID int, productID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.productRepo.SoftDelete(txCtx, productID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductNotFound
			}
			return err
		}

		auditLog := &domain.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    domain.ProductAuditActionDelete,
		}
		return s.auditRepo.Create(txCtx, auditLog)
	})
}

func (s *productServiceImpl) GetAllProducts(ctx context.Context) ([]domain.Product, error) {
	products, err := s.productRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	if products == nil {
		return []domain.Product{}, nil
	}
	return products, nil
}

func (s *productServiceImpl) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
	results, total, err := s.productRepo.GetProductsWithFilters(ctx, filters)
	if err != nil {
		return nil, 0, err
	}
	if results == nil {
		return []catalog_dto.ProductDetailResponse{}, total, nil
	}
	return results, total, nil
}

func (s *productServiceImpl) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) {
	results, err := s.productRepo.SearchProducts(ctx, keyword, locationID, inStockOnly, page, limit)
	if err != nil {
		return nil, err
	}
	if results == nil {
		return []catalog_dto.ProductDetailResponse{}, nil
	}
	return results, nil
}

func (s *productServiceImpl) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) {
	results, err := s.productRepo.GetAllActiveProducts(ctx)
	if err != nil {
		return nil, err
	}
	if results == nil {
		return []catalog_dto.ProductDetailResponse{}, nil
	}
	return results, nil
}

func (s *productServiceImpl) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) {
	product, err := s.productRepo.GetProductDetailWithStock(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrProductNotFound
		}
		return nil, err
	}
	if product == nil {
		return nil, domain.ErrProductNotFound
	}
	return product, nil
}

func (s *productServiceImpl) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) {
	details, err := s.productRepo.GetProductStockDetails(ctx, id)
	if err != nil {
		return nil, err
	}
	if details == nil {
		return []catalog_dto.ProductStockDetailResponse{}, nil
	}
	return details, nil
}

func (s *productServiceImpl) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) {
	history, err := s.productRepo.GetProductHistory(ctx, id)
	if err != nil {
		return nil, err
	}
	if history == nil {
		return []catalog_dto.ProductHistoryResponse{}, nil
	}
	return history, nil
}

func (s *productServiceImpl) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) {
	return s.productRepo.GetProductLastPriceUpdate(ctx, id)
}

// LinkMediaToProduct links unique positive media IDs to a product without duplicating existing links or creating multiple primary images.
func (s *productServiceImpl) LinkMediaToProduct(ctx context.Context, productID int, mediaIDs []int, userID int) error {
	cleanIDs := make([]int, 0, len(mediaIDs))
	seen := make(map[int]struct{}, len(mediaIDs))
	for _, mediaID := range mediaIDs {
		if mediaID <= 0 {
			return domain.ErrEmptyMediaIDs
		}
		if _, dup := seen[mediaID]; dup {
			continue
		}
		seen[mediaID] = struct{}{}
		cleanIDs = append(cleanIDs, mediaID)
	}
	if len(cleanIDs) == 0 {
		return domain.ErrEmptyMediaIDs
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		detail, err := s.productRepo.GetProductDetailWithStock(txCtx, productID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductNotFound
			}
			return err
		}

		hasPrimary := false
		if detail != nil {
			for _, img := range detail.Images {
				if img.IsPrimary {
					hasPrimary = true
					break
				}
			}
		}

		linkedCount := 0
		for _, mediaID := range cleanIDs {
			alreadyLinked, err := s.productRepo.IsMediaLinkedToProduct(txCtx, productID, mediaID)
			if err != nil {
				return err
			}
			if alreadyLinked {
				continue
			}

			isPrimary := 0
			if !hasPrimary {
				isPrimary = 1
				hasPrimary = true
			}
			if err := s.productRepo.LinkMediaToProduct(txCtx, productID, mediaID, isPrimary); err != nil {
				return err
			}
			linkedCount++
		}

		if linkedCount == 0 {
			return nil
		}

		auditLog := &domain.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    domain.ProductAuditActionLinkMedia,
		}
		return s.auditRepo.Create(txCtx, auditLog)
	})
}

// DeleteProductImage removes a product image record inside a transaction.
func (s *productServiceImpl) DeleteProductImage(ctx context.Context, imageID int, userID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.productRepo.DeleteProductImage(txCtx, imageID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductImageNotFound
			}
			return err
		}
		return nil
	})
}

// SetPrimaryImage sets a specific image as the primary image for a product inside a transaction.
func (s *productServiceImpl) SetPrimaryImage(ctx context.Context, productID int, imageID int, userID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.productRepo.SetPrimaryImage(txCtx, productID, imageID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrProductImageNotFound
			}
			return err
		}
		return nil
	})
}

// GetHistoricalStockTimeline computes a paginated timeline with running stock balance.
func (s *productServiceImpl) GetHistoricalStockTimeline(ctx context.Context, productID int, page int, limit int, buildings []string) (map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = defaultTimelineLimit
	}

	cleanBuildings := make([]string, 0, len(buildings))
	buildingSet := make(map[string]struct{}, len(buildings))
	for _, b := range buildings {
		trimmed := strings.TrimSpace(b)
		if trimmed == "" {
			continue
		}
		if _, exists := buildingSet[trimmed]; !exists {
			buildingSet[trimmed] = struct{}{}
			cleanBuildings = append(cleanBuildings, trimmed)
		}
	}

	offset := (page - 1) * limit

	currentStock, err := s.productRepo.GetProductTotalStock(ctx, productID, cleanBuildings)
	if err != nil {
		return nil, err
	}
	totalCount, err := s.productRepo.GetProductStockMovementsCount(ctx, productID, cleanBuildings)
	if err != nil {
		return nil, err
	}
	newerSum, err := s.productRepo.GetSumOfNewerStockMovements(ctx, productID, offset, cleanBuildings)
	if err != nil {
		return nil, err
	}

	movements, err := s.productRepo.GetProductStockMovementsPaginated(ctx, productID, limit, offset, cleanBuildings)
	if err != nil {
		return nil, err
	}

	currentBalance := currentStock - newerSum
	hasBuildingFilter := len(cleanBuildings) > 0

	timeline := make([]catalog_dto.ProductStockTimelineResponse, 0, len(movements))
	for _, mov := range movements {
		balanceAtThisPoint := currentBalance

		netChange := 0
		if hasBuildingFilter {
			_, fromInFilter := buildingSet[derefString(mov.FromBuilding)]
			_, toInFilter := buildingSet[derefString(mov.ToBuilding)]
			if mov.FromBuilding == nil {
				fromInFilter = false
			}
			if mov.ToBuilding == nil {
				toInFilter = false
			}

			if toInFilter && !fromInFilter {
				netChange = mov.Quantity
			} else if fromInFilter && !toInFilter {
				netChange = -mov.Quantity
			}
		} else {
			if mov.FromLocationID == nil && mov.ToLocationID != nil {
				netChange = mov.Quantity
			} else if mov.FromLocationID != nil && mov.ToLocationID == nil {
				netChange = -mov.Quantity
			}
		}

		currentBalance -= netChange

		timeline = append(timeline, catalog_dto.ProductStockTimelineResponse{
			ID:             mov.ID,
			CreatedAt:      mov.CreatedAt,
			MovementType:   mov.MovementType,
			Quantity:       mov.Quantity,
			FromLocationID: mov.FromLocationID,
			ToLocationID:   mov.ToLocationID,
			Notes:          mov.Notes,
			UserName:       mov.UserName,
			BalanceAfter:   balanceAtThisPoint,
			NetChange:      netChange,
		})
	}

	totalPages := (totalCount + limit - 1) / limit

	return map[string]any{
		"data":       timeline,
		"total":      totalCount,
		"page":       page,
		"limit":      limit,
		"totalPages": totalPages,
	}, nil
}

func derefString(val *string) string {
	if val == nil {
		return ""
	}
	return *val
}

func (s *productServiceImpl) ProcessBatchUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error) {
	return s.processMassCatalogUpdate(ctx, jobID, filePath, userID, isDryRun, false)
}

func (s *productServiceImpl) ProcessBatchPackageUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error) {
	return s.processMassCatalogUpdate(ctx, jobID, filePath, userID, isDryRun, true)
}

func (s *productServiceImpl) processMassCatalogUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool, expectPackage bool) (string, error) {
	filePath = utils.ResolveStoragePath(filePath)
	cleanPath := filepath.Clean(filePath)
	ext := filepath.Ext(cleanPath)
	file, err := os.Open(cleanPath)
	if err != nil {
		return "", apperror.Validation("master_data.product.err_open_file", "gagal membuka file batch update", map[string]any{"error": err.Error()})
	}
	defer file.Close()

	parseRes, parsedRows := catalog_parser.ParseMassProductFile(file, ext)
	if !parseRes.Success {
		errMsgs := make([]string, 0, len(parseRes.Errors))
		for _, e := range parseRes.Errors {
			errMsgs = append(errMsgs, fmt.Sprintf("Baris %d: %s", e.Row, e.Message))
		}
		return "", apperror.Validation("master_data.product.err_validation_failed", fmt.Sprintf("Ditemukan %d error validasi: %s", len(errMsgs), strings.Join(errMsgs, " | ")), map[string]any{"count": len(errMsgs)})
	}

	if len(parsedRows) == 0 {
		return "", apperror.Validation("master_data.product.err_no_valid_data", "Tidak ada data valid di dalam file")
	}

	categories, err := s.categoryRepo.FindAllActive(ctx)
	if err != nil {
		return "", apperror.Internal("master_data.category.err_fetch_failed", "Gagal memuat kategori", err)
	}
	categoryMap := make(map[string]int, len(categories))
	for _, c := range categories {
		categoryMap[strings.ToLower(strings.TrimSpace(c.Name))] = c.ID
	}

	skus := make([]string, 0, len(parsedRows))
	for _, r := range parsedRows {
		if r.SKU != "" {
			skus = append(skus, r.SKU)
		}
	}

	dbProducts, err := s.productRepo.GetBySKUs(ctx, skus)
	if err != nil {
		return "", apperror.Internal("master_data.product.err_fetch_failed", "Gagal memuat data produk", err)
	}
	productMap := make(map[string]*domain.Product, len(dbProducts))
	for i := range dbProducts {
		productMap[strings.ToLower(strings.TrimSpace(dbProducts[i].SKU))] = &dbProducts[i]
	}

	type plannedUpdate struct {
		productID int
		rowNum    int
		sku       string
		req       catalog_dto.UpdateProductRequest
	}

	// Phase 1: Validate every row before touching the database so invalid batches never partially commit.
	plannedUpdates := make([]plannedUpdate, 0, len(parsedRows))
	var finalErrors []string

	for i, row := range parsedRows {
		rowNum := i + 2
		dbProduct, exists := productMap[strings.ToLower(strings.TrimSpace(row.SKU))]
		if !exists {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: SKU '%s' tidak ditemukan. Batch edit hanya untuk update.", rowNum, row.SKU))
			continue
		}

		if !expectPackage && dbProduct.IsPackage {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: SKU '%s' adalah Paket. Batch edit hanya untuk Produk.", rowNum, row.SKU))
			continue
		}
		if expectPackage && !dbProduct.IsPackage {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: SKU '%s' adalah Produk Satuan. Menu ini khusus untuk Paket.", rowNum, row.SKU))
			continue
		}

		isActive := dbProduct.IsActive
		req := catalog_dto.UpdateProductRequest{
			SKU:        dbProduct.SKU,
			Name:       dbProduct.Name,
			CategoryID: dbProduct.CategoryID,
			Price:      dbProduct.Price,
			Weight:     dbProduct.Weight,
			Length:     dbProduct.Length,
			Width:      dbProduct.Width,
			Height:     dbProduct.Height,
			IsPackage:  expectPackage,
			IsActive:   &isActive,
		}

		if row.Name != "" {
			req.Name = row.Name
		}
		if row.Category != "" {
			catID, ok := categoryMap[strings.ToLower(strings.TrimSpace(row.Category))]
			if !ok {
				finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Kategori '%s' tidak ditemukan.", rowNum, row.Category))
				continue
			}
			req.CategoryID = &catID
		}
		if row.Price != nil {
			req.Price = *row.Price
		}
		if row.Weight != nil {
			req.Weight = *row.Weight
		}
		if row.Length != nil {
			req.Length = *row.Length
		}
		if row.Width != nil {
			req.Width = *row.Width
		}
		if row.Height != nil {
			req.Height = *row.Height
		}
		if row.IsActive != nil {
			req.IsActive = row.IsActive
		}

		if err := domain.ValidateProductMetrics(req.Price, req.Weight, req.Length, req.Width, req.Height); err != nil {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Harga atau dimensi SKU '%s' tidak valid.", rowNum, row.SKU))
			continue
		}

		plannedUpdates = append(plannedUpdates, plannedUpdate{
			productID: dbProduct.ID,
			rowNum:    rowNum,
			sku:       row.SKU,
			req:       req,
		})
	}

	modeStr := ""
	if isDryRun {
		modeStr = "[SIMULASI] "
	}

	entityName := "produk"
	if expectPackage {
		entityName = "paket"
	}

	if len(finalErrors) > 0 {
		summary := i18n.T(ctx, "master_data.product.summary_partial", map[string]any{
			"mode":    modeStr,
			"success": 0,
			"entity":  entityName,
			"failed":  len(finalErrors),
		})
		if summary == "master_data.product.summary_partial" {
			summary = fmt.Sprintf("%sBerhasil: 0 %s. Gagal: %d %s.", modeStr, entityName, len(finalErrors), entityName)
		}
		return summary, apperror.Validation(
			"master_data.product.err_batch_validation",
			fmt.Sprintf("Ditemukan %d error: %s", len(finalErrors), strings.Join(finalErrors, " | ")),
			map[string]any{"count": len(finalErrors)},
		)
	}

	// Phase 2: Persist all validated updates atomically inside a single transaction.
	if !isDryRun {
		if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
			for _, item := range plannedUpdates {
				if err := s.UpdateProduct(txCtx, userID, item.productID, item.req); err != nil {
					return apperror.Internal(
						"master_data.product.err_batch_save_failed",
						fmt.Sprintf("Baris %d: Gagal update SKU '%s': %v", item.rowNum, item.sku, err),
						err,
						map[string]any{"row": item.rowNum, "sku": item.sku},
					)
				}
			}
			return nil
		}); err != nil {
			return "", err
		}
	}

	successCount := len(plannedUpdates)
	summary := i18n.T(ctx, "master_data.product.summary_success", map[string]any{
		"mode":    modeStr,
		"success": successCount,
		"entity":  entityName,
	})
	if summary == "master_data.product.summary_success" {
		summary = fmt.Sprintf("%sSelesai. Berhasil mengupdate %d %s.", modeStr, successCount, entityName)
	}
	return summary, nil
}
