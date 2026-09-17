package port

import (
	"context"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

type CategoryRepository interface {
	database.BaseRepository[domain.Category]
	FindAllActive(ctx context.Context) ([]domain.Category, error)
	Create(ctx context.Context, category *domain.Category) error
	Update(ctx context.Context, id int, name string) error
	Delete(ctx context.Context, id int) error
}

type ProductRepository interface {
	database.BaseRepository[domain.Product]
	Create(ctx context.Context, product *domain.Product) error
	Update(ctx context.Context, product *domain.Product) error
	GetBySKUs(ctx context.Context, skus []string) ([]domain.Product, error)

	// New methods
	GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error)
	SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error)
	GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]catalog_dto.ProductDetailResponse, error)
	GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error)
	GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error)
	GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error)
	GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error)
	GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error)

	// Images
	LinkMediaToProduct(ctx context.Context, productID int, mediaID int, isPrimary int) error
	DeleteProductImage(ctx context.Context, imageID int) error
	SetPrimaryImage(ctx context.Context, productID int, imageID int) error

	// Stock and History
	GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error)
	GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error)
	GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error)
	GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]RawStockMovement, error)
}

type RawStockMovement struct {
	ID             int     `db:"id"`
	Quantity       int     `db:"quantity"`
	FromLocationID *int    `db:"from_location_id"`
	ToLocationID   *int    `db:"to_location_id"`
	MovementType   string  `db:"movement_type"`
	Notes          *string `db:"notes"`
	CreatedAt      string  `db:"created_at"`
	UserName       *string `db:"user_name"`
	FromBuilding   *string `db:"from_building"`
	ToBuilding     *string `db:"to_building"`
}

type ProductAuditRepository interface {
	Create(ctx context.Context, log *domain.ProductAuditLog) error
}
