package port

import (
	"context"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
)

type CategoryUseCase interface {
	CreateCategory(ctx context.Context, req catalog_dto.CreateCategoryRequest) (*domain.Category, error)
	GetActiveCategories(ctx context.Context) ([]domain.Category, error)
	UpdateCategory(ctx context.Context, id int, req catalog_dto.UpdateCategoryRequest) error
	DeleteCategory(ctx context.Context, id int) error
}

type ProductUseCase interface {
	CreateProduct(ctx context.Context, userID int, req catalog_dto.CreateProductRequest) (*domain.Product, error)
	DeleteProduct(ctx context.Context, userID int, productID int) error
	GetAllProducts(ctx context.Context) ([]domain.Product, error)
	UpdateProduct(ctx context.Context, userID int, productID int, req catalog_dto.UpdateProductRequest) error
	GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error)
	SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error)
	GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error)
	GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error)
	GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error)
	GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error)
	GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error)
	LinkMediaToProduct(ctx context.Context, productID int, mediaIDs []int, userID int) error
	DeleteProductImage(ctx context.Context, imageID int, userID int) error
	SetPrimaryImage(ctx context.Context, productID int, imageID int, userID int) error
	GetHistoricalStockTimeline(ctx context.Context, productID int, page int, limit int, buildings []string) (map[string]interface{}, error)
	ProcessBatchUpdate(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error)
}
