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
	products      map[string]*domain.Product
	productsByID  map[int]*domain.Product
	components    map[int][]domain.PackageComponent
	restoredIDs   []int
}

func (m *mockProductRepo) Create(ctx context.Context, product *domain.Product) error {
	if product.ID == 0 {
		product.ID = 100
	}
	return nil
}
func (m *mockProductRepo) Update(ctx context.Context, product *domain.Product) error {
	if p, ok := m.products[product.SKU]; ok {
		p.Name = product.Name
		p.Price = product.Price
		p.IsActive = product.IsActive
		p.IsPackage = product.IsPackage
	}
	if m.productsByID != nil {
		if p, ok := m.productsByID[product.ID]; ok {
			p.Name = product.Name
			p.Price = product.Price
			p.IsActive = product.IsActive
			p.IsPackage = product.IsPackage
		}
	}
	return nil
}
func (m *mockProductRepo) ReplacePackageComponents(ctx context.Context, packageProductID int, components []domain.PackageComponent) error {
	if m.components == nil {
		m.components = make(map[int][]domain.PackageComponent)
	}
	m.components[packageProductID] = components
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
func (m *mockProductRepo) FindByID(ctx context.Context, id int) (*domain.Product, error) {
	if m.productsByID != nil {
		if p, ok := m.productsByID[id]; ok {
			return p, nil
		}
	}
	return nil, nil
}
func (m *mockProductRepo) FindAll(ctx context.Context) ([]domain.Product, error) { return nil, nil }
func (m *mockProductRepo) Delete(ctx context.Context, id int) error { return nil }
func (m *mockProductRepo) SoftDelete(ctx context.Context, id int) error { return nil }
func (m *mockProductRepo) Restore(ctx context.Context, id int) error {
	m.restoredIDs = append(m.restoredIDs, id)
	return nil
}

type mockAuditRepo struct{}
func (m *mockAuditRepo) Create(ctx context.Context, log *domain.ProductAuditLog) error { return nil }
func (m *mockAuditRepo) GetByProductID(ctx context.Context, productID int) ([]domain.ProductAuditLog, error) { return nil, nil }

type mockCategoryRepo struct{}
func (m *mockCategoryRepo) FindAllActive(ctx context.Context) ([]domain.Category, error) {
	return []domain.Category{{Name: "Elektronik"}}, nil
}
func (m *mockCategoryRepo) FindByStatus(ctx context.Context, status string) ([]domain.Category, error) {
	return m.FindAllActive(ctx)
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

func TestUpdateProduct_SingleToPackage_PreservesActiveAndSavesComponents(t *testing.T) {
	prod := &domain.Product{
		SKU:       "PP0006740",
		Name:      "Sample Single",
		IsActive:  true,
		IsPackage: false,
	}
	prod.ID = 6740

	prodRepo := &mockProductRepo{
		products:     map[string]*domain.Product{"PP0006740": prod},
		productsByID: map[int]*domain.Product{6740: prod},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	comps := []catalog_dto.ProductComponentInput{
		{ComponentProductID: 101, Quantity: 2},
		{ID: 102, Quantity: 3},
	}
	err := svc.UpdateProduct(context.Background(), 1, 6740, catalog_dto.UpdateProductRequest{
		SKU:        "PP0006740",
		Name:       "Sample Package",
		Price:      15000,
		IsPackage:  true,
		IsActive:   nil, // omitted by ProductFormModal
		Components: &comps,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !prod.IsActive {
		t.Fatalf("expected product to remain active when is_active is omitted")
	}
	if !prod.IsPackage {
		t.Fatalf("expected product to become package")
	}
	savedComps := prodRepo.components[6740]
	if len(savedComps) != 2 {
		t.Fatalf("expected 2 saved components, got %d", len(savedComps))
	}
	if savedComps[0].ComponentProductID != 101 || savedComps[0].QuantityPerPackage != 2 {
		t.Errorf("unexpected first component: %+v", savedComps[0])
	}
	if savedComps[1].ComponentProductID != 102 || savedComps[1].QuantityPerPackage != 3 {
		t.Errorf("unexpected second component: %+v", savedComps[1])
	}
}

func TestUpdateProduct_RejectsSelfComponent(t *testing.T) {
	prod := &domain.Product{SKU: "PP0006740", Name: "Sample", IsActive: true}
	prod.ID = 6740
	prodRepo := &mockProductRepo{productsByID: map[int]*domain.Product{6740: prod}}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	comps := []catalog_dto.ProductComponentInput{{ComponentProductID: 6740, Quantity: 1}}
	err := svc.UpdateProduct(context.Background(), 1, 6740, catalog_dto.UpdateProductRequest{
		SKU:        "PP0006740",
		Name:       "Sample",
		IsPackage:  true,
		Components: &comps,
	})
	if err == nil {
		t.Fatalf("expected validation error when product references itself as component")
	}
}

func TestUpdateProduct_PackageToSingle_ClearsComponents(t *testing.T) {
	prod := &domain.Product{SKU: "PP0006740", Name: "Sample Package", IsActive: true, IsPackage: true}
	prod.ID = 6740
	prodRepo := &mockProductRepo{
		products:     map[string]*domain.Product{"PP0006740": prod},
		productsByID: map[int]*domain.Product{6740: prod},
		components: map[int][]domain.PackageComponent{
			6740: {{PackageProductID: 6740, ComponentProductID: 101, QuantityPerPackage: 2}},
		},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	err := svc.UpdateProduct(context.Background(), 1, 6740, catalog_dto.UpdateProductRequest{
		SKU:       "PP0006740",
		Name:      "Sample Single Again",
		IsPackage: false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prodRepo.components[6740]) != 0 {
		t.Fatalf("expected components to be cleared when converted back to single, got %+v", prodRepo.components[6740])
	}
}

