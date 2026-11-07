package usecase_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
)

type mockTxManager struct{}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type mockProductRepo struct {
	products map[string]*domain.Product
}

func (m *mockProductRepo) Create(ctx context.Context, product *domain.Product) error { return nil }
func (m *mockProductRepo) Update(ctx context.Context, product *domain.Product) error {
	if p, ok := m.products[product.SKU]; ok {
		p.Name = product.Name
		p.Price = product.Price
	}
	return nil
}
func (m *mockProductRepo) GetBySKUs(ctx context.Context, skus []string) ([]domain.Product, error) {
	var result []domain.Product
	for _, sku := range skus {
		if p, ok := m.products[sku]; ok {
			result = append(result, *p)
		}
	}
	return result, nil
}
func (m *mockProductRepo) GetProductIDBySKUTx(ctx context.Context, sku string) (int, error) { return 0, nil }
func (m *mockProductRepo) CreateProductTx(ctx context.Context, product *domain.Product) (int, error) { return 0, nil }
func (m *mockProductRepo) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) { return nil, 0, nil }
func (m *mockProductRepo) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockProductRepo) GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockProductRepo) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockProductRepo) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockProductRepo) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) { return nil, nil }
func (m *mockProductRepo) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) { return nil, nil }
func (m *mockProductRepo) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) { return nil, nil }
func (m *mockProductRepo) LinkMediaToProduct(ctx context.Context, productID int, mediaID int, isPrimary int) error { return nil }
func (m *mockProductRepo) IsMediaLinkedToProduct(ctx context.Context, productID int, mediaID int) (bool, error) { return false, nil }
func (m *mockProductRepo) DeleteProductImage(ctx context.Context, imageID int) error { return nil }
func (m *mockProductRepo) SetPrimaryImage(ctx context.Context, productID int, imageID int) error { return nil }
func (m *mockProductRepo) GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error) { return 0, nil }
func (m *mockProductRepo) GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error) { return 0, nil }
func (m *mockProductRepo) GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error) { return 0, nil }
func (m *mockProductRepo) GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]catalog_port.RawStockMovement, error) { return nil, nil }
func (m *mockProductRepo) FindByID(ctx context.Context, id int) (*domain.Product, error) { return nil, nil }
func (m *mockProductRepo) FindAll(ctx context.Context) ([]domain.Product, error) { return nil, nil }
func (m *mockProductRepo) Delete(ctx context.Context, id int) error { return nil }
func (m *mockProductRepo) SoftDelete(ctx context.Context, id int) error { return nil }
func (m *mockProductRepo) Restore(ctx context.Context, id int) error { return nil }

type mockAuditRepo struct{}
func (m *mockAuditRepo) Create(ctx context.Context, log *domain.ProductAuditLog) error { return nil }
func (m *mockAuditRepo) GetByProductID(ctx context.Context, productID int) ([]domain.ProductAuditLog, error) { return nil, nil }

type mockCategoryRepo struct{}
func (m *mockCategoryRepo) FindAllActive(ctx context.Context) ([]domain.Category, error) {
	return []domain.Category{{Name: "Elektronik"}}, nil
}
func (m *mockCategoryRepo) Create(ctx context.Context, category *domain.Category) error { return nil }
func (m *mockCategoryRepo) Update(ctx context.Context, id int, name string) error { return nil }
func (m *mockCategoryRepo) Delete(ctx context.Context, id int) error { return nil }
func (m *mockCategoryRepo) FindByID(ctx context.Context, id int) (*domain.Category, error) { return nil, nil }
func (m *mockCategoryRepo) FindAll(ctx context.Context) ([]domain.Category, error) { return nil, nil }
func (m *mockCategoryRepo) SoftDelete(ctx context.Context, id int) error { return nil }
func (m *mockCategoryRepo) Restore(ctx context.Context, id int) error { return nil }

func TestProcessBatchPackageUpdate_ValidatesEntityType(t *testing.T) {
	prodRepo := &mockProductRepo{
		products: map[string]*domain.Product{
			"PRD-01": {SKU: "PRD-01", Name: "Produk Satuan", IsPackage: false},
			"PKG-01": {SKU: "PKG-01", Name: "Paket Bundling", IsPackage: true},
		},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	tempDir := t.TempDir()
	csvPath := filepath.Join(tempDir, "test.csv")
	csvContent := `SKU,Nama Paket,Harga Jual
PRD-01,Produk Satuan Diubah,10000
PKG-01,Paket Bundling Diubah,20000
`
	if err := os.WriteFile(csvPath, []byte(csvContent), 0600); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// ProcessBatchPackageUpdate should reject PRD-01 because it's not a package
	summary, err := svc.ProcessBatchPackageUpdate(context.Background(), 1, csvPath, 1, false)
	if err == nil {
		t.Fatalf("expected error rejecting PRD-01 as non-package, got nil: %s", summary)
	}

	// ProcessBatchUpdate should reject PKG-01 because it is a package
	summaryProd, errProd := svc.ProcessBatchUpdate(context.Background(), 1, csvPath, 1, false)
	if errProd == nil {
		t.Fatalf("expected error rejecting PKG-01 as package, got nil: %s", summaryProd)
	}
}

