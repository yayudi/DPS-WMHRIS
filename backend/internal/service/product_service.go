package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/database"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/parser"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/jmoiron/sqlx"
)

type ProductService interface {
	CreateProduct(ctx context.Context, userID int, req dto.CreateProductRequest) (*model.Product, error)
	DeleteProduct(ctx context.Context, userID int, productID int) error
	GetAllProducts(ctx context.Context) ([]model.Product, error)
	UpdateProduct(ctx context.Context, userID int, productID int, req dto.UpdateProductRequest) error
	GetProductsWithFilters(ctx context.Context, filters dto.ProductFilterRequest) ([]dto.ProductDetailResponse, int, error)
	SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]dto.ProductDetailResponse, error)
	GetAllActiveProducts(ctx context.Context) ([]dto.ProductDetailResponse, error)
	GetProductDetailWithStock(ctx context.Context, id int) (*dto.ProductDetailResponse, error)
	GetProductStockDetails(ctx context.Context, id int) ([]dto.ProductStockDetailResponse, error)
	GetProductHistory(ctx context.Context, id int) ([]dto.ProductHistoryResponse, error)
	GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error)
	LinkMediaToProduct(ctx context.Context, productID int, mediaIDs []int, userID int) error
	DeleteProductImage(ctx context.Context, imageID int, userID int) error
	SetPrimaryImage(ctx context.Context, productID int, imageID int, userID int) error
	GetHistoricalStockTimeline(ctx context.Context, productID int, page int, limit int, buildings []string) (map[string]interface{}, error)
	ProcessBatchUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error)
}

type productServiceImpl struct {
	db           *sqlx.DB
	productRepo  repository.ProductRepository
	auditRepo    repository.ProductAuditRepository
	categoryRepo repository.CategoryRepository
}

func NewProductService(db *sqlx.DB, productRepo repository.ProductRepository, auditRepo repository.ProductAuditRepository, categoryRepo repository.CategoryRepository) ProductService {
	return &productServiceImpl{
		db:           db,
		productRepo:  productRepo,
		auditRepo:    auditRepo,
		categoryRepo: categoryRepo,
	}
}

func (s *productServiceImpl) CreateProduct(ctx context.Context, userID int, req dto.CreateProductRequest) (*model.Product, error) {
	product := &model.Product{
		SKU:        req.SKU,
		Name:       req.Name,
		CategoryID: req.CategoryID,
		Price:      req.Price,
		IsActive:   true,
		IsPackage:  req.IsPackage,
		Weight:     req.Weight,
		Length:     req.Length,
		Width:      req.Width,
		Height:     req.Height,
	}

	err := database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		if err := s.productRepo.Create(ctx, tx, product); err != nil {
			return err
		}

		log := &model.ProductAuditLog{
			ProductID: product.ID,
			UserID:    &userID,
			Action:    "CREATE",
		}
		return s.auditRepo.Create(ctx, tx, log)
	})

	if err != nil {
		return nil, err
	}

	return product, nil
}

func (s *productServiceImpl) UpdateProduct(ctx context.Context, userID int, productID int, req dto.UpdateProductRequest) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		// Handle Restore logic
		if req.IsActive && req.Name == "" {
			if err := s.productRepo.Restore(ctx, tx, productID); err != nil {
				return err
			}
			log := &model.ProductAuditLog{
				ProductID: productID,
				UserID:    &userID,
				Action:    "RESTORE",
			}
			return s.auditRepo.Create(ctx, tx, log)
		}

		// Normal Update
		product := &model.Product{
			BaseEntity: model.BaseEntity{ID: productID},
			SKU:        req.SKU,
			Name:       req.Name,
			CategoryID: req.CategoryID,
			Price:      req.Price,
			IsPackage:  req.IsPackage,
			IsActive:   req.IsActive,
			Weight:     req.Weight,
			Length:     req.Length,
			Width:      req.Width,
			Height:     req.Height,
		}

		if err := s.productRepo.Update(ctx, tx, product); err != nil {
			return err
		}

		log := &model.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    "UPDATE",
		}
		return s.auditRepo.Create(ctx, tx, log)
	})
}

func (s *productServiceImpl) DeleteProduct(ctx context.Context, userID int, productID int) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		if err := s.productRepo.SoftDelete(ctx, tx, productID); err != nil {
			return err
		}

		log := &model.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    "DELETE",
		}
		return s.auditRepo.Create(ctx, tx, log)
	})
}

func (s *productServiceImpl) GetAllProducts(ctx context.Context) ([]model.Product, error) {
	return s.productRepo.FindAll(ctx)
}

func (s *productServiceImpl) GetProductsWithFilters(ctx context.Context, filters dto.ProductFilterRequest) ([]dto.ProductDetailResponse, int, error) {
	return s.productRepo.GetProductsWithFilters(ctx, filters)
}

func (s *productServiceImpl) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]dto.ProductDetailResponse, error) {
	return s.productRepo.SearchProducts(ctx, keyword, locationID, inStockOnly, page, limit)
}

func (s *productServiceImpl) GetAllActiveProducts(ctx context.Context) ([]dto.ProductDetailResponse, error) {
	return s.productRepo.GetAllActiveProducts(ctx)
}

func (s *productServiceImpl) GetProductDetailWithStock(ctx context.Context, id int) (*dto.ProductDetailResponse, error) {
	return s.productRepo.GetProductDetailWithStock(ctx, id)
}

func (s *productServiceImpl) GetProductStockDetails(ctx context.Context, id int) ([]dto.ProductStockDetailResponse, error) {
	return s.productRepo.GetProductStockDetails(ctx, id)
}

func (s *productServiceImpl) GetProductHistory(ctx context.Context, id int) ([]dto.ProductHistoryResponse, error) {
	return s.productRepo.GetProductHistory(ctx, id)
}

func (s *productServiceImpl) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) {
	return s.productRepo.GetProductLastPriceUpdate(ctx, id)
}

// LinkMediaToProduct links multiple media IDs to a product.
func (s *productServiceImpl) LinkMediaToProduct(ctx context.Context, productID int, mediaIDs []int, userID int) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		for i, mediaID := range mediaIDs {
			isPrimary := 0
			if i == 0 {
				isPrimary = 1
			}
			if err := s.productRepo.LinkMediaToProduct(ctx, tx, productID, mediaID, isPrimary); err != nil {
				return err
			}
		}

		log := &model.ProductAuditLog{
			ProductID: productID,
			UserID:    &userID,
			Action:    "LINK_MEDIA",
		}
		return s.auditRepo.Create(ctx, tx, log)
	})
}

// DeleteProductImage removes a product image record.
func (s *productServiceImpl) DeleteProductImage(ctx context.Context, imageID int, userID int) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		return s.productRepo.DeleteProductImage(ctx, tx, imageID)
	})
}

// SetPrimaryImage sets a specific image as the primary image for a product.
func (s *productServiceImpl) SetPrimaryImage(ctx context.Context, productID int, imageID int, userID int) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		return s.productRepo.SetPrimaryImage(ctx, tx, productID, imageID)
	})
}

// GetHistoricalStockTimeline computes a paginated timeline with running balance.
func (s *productServiceImpl) GetHistoricalStockTimeline(ctx context.Context, productID int, page int, limit int, buildings []string) (map[string]interface{}, error) {
	offset := (page - 1) * limit

	// Run aggregations
	currentStock, err := s.productRepo.GetProductTotalStock(ctx, productID, buildings)
	if err != nil {
		return nil, err
	}
	totalCount, err := s.productRepo.GetProductStockMovementsCount(ctx, productID, buildings)
	if err != nil {
		return nil, err
	}
	newerSum, err := s.productRepo.GetSumOfNewerStockMovements(ctx, productID, offset, buildings)
	if err != nil {
		return nil, err
	}

	movements, err := s.productRepo.GetProductStockMovementsPaginated(ctx, productID, limit, offset, buildings)
	if err != nil {
		return nil, err
	}

	// Balance at the very beginning of the paginated list
	currentBalance := currentStock - newerSum
	hasBuildingFilter := len(buildings) > 0

	timeline := make([]dto.ProductStockTimelineResponse, 0, len(movements))
	for _, mov := range movements {
		balanceAtThisPoint := currentBalance

		netChange := 0
		if hasBuildingFilter {
			fromInFilter := containsString(buildings, mov.FromBuilding)
			toInFilter := containsString(buildings, mov.ToBuilding)

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

		timeline = append(timeline, dto.ProductStockTimelineResponse{
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

	totalPages := 0
	if limit > 0 {
		totalPages = (totalCount + limit - 1) / limit
	}

	return map[string]interface{}{
		"data":       timeline,
		"total":      totalCount,
		"page":       page,
		"limit":      limit,
		"totalPages": totalPages,
	}, nil
}

// containsString checks if a nullable string is in a slice.
func containsString(slice []string, val *string) bool {
	if val == nil {
		return false
	}
	for _, s := range slice {
		if s == *val {
			return true
		}
	}
	return false
}

func (s *productServiceImpl) ProcessBatchUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error) {
	parseRes, parsedRows := parser.ParseMassProductFile(filePath)
	if !parseRes.Success {
		var errMsgs []string
		for _, e := range parseRes.Errors {
			errMsgs = append(errMsgs, fmt.Sprintf("Baris %d: %s", e.Row, e.Message))
		}
		return "", fmt.Errorf("Ditemukan %d error validasi: %s", len(errMsgs), strings.Join(errMsgs, " | "))
	}

	if len(parsedRows) == 0 {
		return "", fmt.Errorf("Tidak ada data valid di dalam file")
	}

	categories, err := s.categoryRepo.FindAllActive(ctx)
	if err != nil {
		return "", fmt.Errorf("Gagal memuat kategori: %v", err)
	}
	categoryMap := make(map[string]int)
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
		return "", fmt.Errorf("Gagal memuat data produk: %v", err)
	}
	productMap := make(map[string]*model.Product)
	for i := range dbProducts {
		productMap[strings.ToLower(dbProducts[i].SKU)] = &dbProducts[i]
	}

	successCount := 0
	var finalErrors []string

	for i, row := range parsedRows {
		dbProduct, exists := productMap[strings.ToLower(row.SKU)]
		if !exists {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: SKU '%s' tidak ditemukan. Batch edit hanya untuk update.", i+2, row.SKU))
			continue
		}

		if dbProduct.IsPackage {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: SKU '%s' adalah Paket. Batch edit hanya untuk Produk.", i+2, row.SKU))
			continue
		}

		req := dto.UpdateProductRequest{
			SKU:        dbProduct.SKU,
			Name:       dbProduct.Name,
			CategoryID: dbProduct.CategoryID,
			Price:      dbProduct.Price,
			Weight:     dbProduct.Weight,
			Length:     dbProduct.Length,
			Width:      dbProduct.Width,
			Height:     dbProduct.Height,
			IsPackage:  dbProduct.IsPackage,
			IsActive:   dbProduct.IsActive,
		}

		if row.Name != "" {
			req.Name = row.Name
		}
		if row.Category != "" {
			catID, ok := categoryMap[strings.ToLower(strings.TrimSpace(row.Category))]
			if !ok {
				finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Kategori '%s' tidak ditemukan.", i+2, row.Category))
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
			req.IsActive = *row.IsActive
		}

		if !isDryRun {
			err := s.UpdateProduct(ctx, userID, dbProduct.ID, req)
			if err != nil {
				finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Gagal update SKU '%s': %v", i+2, row.SKU, err))
				continue
			}
		}
		successCount++
	}

	modeStr := ""
	if isDryRun {
		modeStr = "[SIMULASI] "
	}

	if len(finalErrors) > 0 {
		return fmt.Sprintf("%sBerhasil: %d. Gagal: %d", modeStr, successCount, len(finalErrors)), fmt.Errorf("Ditemukan %d error: %s", len(finalErrors), strings.Join(finalErrors, " | "))
	}

	return fmt.Sprintf("%sSelesai. Berhasil mengupdate %d produk.", modeStr, successCount), nil
}

