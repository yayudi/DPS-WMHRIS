package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/go-sql-driver/mysql"
)

type mockTxManager struct {
	calls int
}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.calls++
	return fn(ctx)
}

type mockProductRepo struct {
	products         map[string]*domain.Product
	productsByID     map[int]*domain.Product
	detailsByID      map[int]*catalog_dto.ProductDetailResponse
	components       map[int][]domain.PackageComponent
	restoredIDs      []int
	linkedMedia      map[int][]struct{ mediaID, isPrimary int }
	alreadyLinked    map[int]map[int]bool
	createErr        error
	updateErr        error
	updateCalls      int
	deleteImageErr   error
	setPrimaryErr    error
	totalStock       int
	movementsCount   int
	newerSum         int
	movements        []catalog_port.RawStockMovement
	lastBuildingsArg []string
	lastOffsetArg    int
	lastLimitArg     int
}

func (m *mockProductRepo) Create(ctx context.Context, product *domain.Product) error {
	if m.createErr != nil {
		return m.createErr
	}
	if product.ID == 0 {
		product.ID = 100
	}
	return nil
}

func (m *mockProductRepo) Update(ctx context.Context, product *domain.Product) error {
	m.updateCalls++
	if m.updateErr != nil {
		return m.updateErr
	}
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

func (m *mockProductRepo) GetProductIDBySKUTx(ctx context.Context, sku string) (int, error) {
	return 0, nil
}
func (m *mockProductRepo) CreateProductTx(ctx context.Context, product *domain.Product) (int, error) {
	return 0, nil
}
func (m *mockProductRepo) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) {
	return nil, 0, nil
}
func (m *mockProductRepo) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductRepo) GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductRepo) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) {
	return nil, nil
}
func (m *mockProductRepo) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) {
	if m.detailsByID != nil {
		if d, ok := m.detailsByID[id]; ok {
			return d, nil
		}
		return nil, sql.ErrNoRows
	}
	return nil, nil
}
func (m *mockProductRepo) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) {
	return nil, nil
}
func (m *mockProductRepo) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) {
	return nil, nil
}
func (m *mockProductRepo) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) {
	return nil, nil
}
func (m *mockProductRepo) LinkMediaToProduct(ctx context.Context, productID int, mediaID int, isPrimary int) error {
	if m.linkedMedia == nil {
		m.linkedMedia = make(map[int][]struct{ mediaID, isPrimary int })
	}
	m.linkedMedia[productID] = append(m.linkedMedia[productID], struct{ mediaID, isPrimary int }{mediaID: mediaID, isPrimary: isPrimary})
	return nil
}
func (m *mockProductRepo) IsMediaLinkedToProduct(ctx context.Context, productID int, mediaID int) (bool, error) {
	if m.alreadyLinked != nil && m.alreadyLinked[productID] != nil {
		return m.alreadyLinked[productID][mediaID], nil
	}
	return false, nil
}
func (m *mockProductRepo) DeleteProductImage(ctx context.Context, imageID int) error {
	return m.deleteImageErr
}
func (m *mockProductRepo) SetPrimaryImage(ctx context.Context, productID int, imageID int) error {
	return m.setPrimaryErr
}
func (m *mockProductRepo) GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error) {
	m.lastBuildingsArg = buildings
	return m.totalStock, nil
}
func (m *mockProductRepo) GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error) {
	return m.movementsCount, nil
}
func (m *mockProductRepo) GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error) {
	m.lastOffsetArg = offset
	return m.newerSum, nil
}
func (m *mockProductRepo) GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]catalog_port.RawStockMovement, error) {
	m.lastLimitArg = limit
	return m.movements, nil
}
func (m *mockProductRepo) FindByID(ctx context.Context, id int) (*domain.Product, error) {
	if m.productsByID != nil {
		if p, ok := m.productsByID[id]; ok {
			return p, nil
		}
		return nil, sql.ErrNoRows
	}
	return nil, nil
}
func (m *mockProductRepo) FindAll(ctx context.Context) ([]domain.Product, error) { return nil, nil }
func (m *mockProductRepo) SoftDelete(ctx context.Context, id int) error          { return nil }
func (m *mockProductRepo) Restore(ctx context.Context, id int) error {
	m.restoredIDs = append(m.restoredIDs, id)
	return nil
}

type mockAuditRepo struct {
	logs []*domain.ProductAuditLog
}

func (m *mockAuditRepo) Create(ctx context.Context, log *domain.ProductAuditLog) error {
	m.logs = append(m.logs, log)
	return nil
}

type mockCategoryRepo struct {
	categories []domain.Category
	createErr  error
	updateErr  error
	deleteErr  error
	restoreErr error
	lastStatus string
	lastName   string
}

func (m *mockCategoryRepo) FindAllActive(ctx context.Context) ([]domain.Category, error) {
	if m.categories != nil {
		return m.categories, nil
	}
	return []domain.Category{{Name: "Elektronik"}}, nil
}
func (m *mockCategoryRepo) FindByStatus(ctx context.Context, status string) ([]domain.Category, error) {
	m.lastStatus = status
	return m.categories, nil
}
func (m *mockCategoryRepo) Create(ctx context.Context, category *domain.Category) error {
	if m.createErr != nil {
		return m.createErr
	}
	m.lastName = category.Name
	category.ID = 7
	return nil
}
func (m *mockCategoryRepo) Update(ctx context.Context, id int, name string) error {
	m.lastName = name
	return m.updateErr
}
func (m *mockCategoryRepo) Delete(ctx context.Context, id int) error {
	return m.deleteErr
}
func (m *mockCategoryRepo) FindByID(ctx context.Context, id int) (*domain.Category, error) {
	return nil, nil
}
func (m *mockCategoryRepo) FindAll(ctx context.Context) ([]domain.Category, error) { return nil, nil }
func (m *mockCategoryRepo) SoftDelete(ctx context.Context, id int) error           { return nil }
func (m *mockCategoryRepo) Restore(ctx context.Context, id int) error              { return m.restoreErr }

func TestProcessBatchPackageUpdate_ValidatesEntityTypeWithoutPartialCommit(t *testing.T) {
	prodRepo := &mockProductRepo{
		products: map[string]*domain.Product{
			"PRD-01": {SKU: "PRD-01", Name: "Produk Satuan", IsPackage: false, IsActive: true},
			"PKG-01": {SKU: "PKG-01", Name: "Paket Bundling", IsPackage: true, IsActive: true},
		},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	tempDir := t.TempDir()
	csvPath := filepath.Join(tempDir, "test.csv")
	csvContent := "SKU,Nama Paket,Harga Jual\nPRD-01,Produk Satuan Diubah,10000\nPKG-01,Paket Bundling Diubah,20000\n"
	if err := os.WriteFile(csvPath, []byte(csvContent), 0o600); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// ProcessBatchPackageUpdate must reject PRD-01 as non-package WITHOUT partially updating PKG-01
	_, err := svc.ProcessBatchPackageUpdate(context.Background(), 1, csvPath, 1, false)
	var appErr *apperror.AppError
	if !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected apperror validation error rejecting PRD-01, got %v", err)
	}
	if prodRepo.updateCalls != 0 {
		t.Fatalf("expected 0 DB writes when batch validation fails (no partial commit), got %d", prodRepo.updateCalls)
	}

	// ProcessBatchUpdate must reject PKG-01 as package without partial commit
	_, errProd := svc.ProcessBatchUpdate(context.Background(), 1, csvPath, 1, false)
	if !errors.As(errProd, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected apperror validation error rejecting PKG-01, got %v", errProd)
	}
	if prodRepo.updateCalls != 0 {
		t.Fatalf("expected 0 DB writes on invalid batch, got %d", prodRepo.updateCalls)
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
		IsActive:   nil,
		Components: &comps,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !prod.IsActive || !prod.IsPackage {
		t.Fatalf("expected active package, got active=%v package=%v", prod.IsActive, prod.IsPackage)
	}
	savedComps := prodRepo.components[6740]
	if len(savedComps) != 2 || savedComps[0].ComponentProductID != 101 || savedComps[1].ComponentProductID != 102 {
		t.Fatalf("unexpected saved components: %+v", savedComps)
	}
}

func TestUpdateProduct_PreservesNameAndMapsDuplicateSKU(t *testing.T) {
	prod := &domain.Product{SKU: "SKU-1", Name: "Nama Asli", IsActive: true}
	prod.ID = 10
	prodRepo := &mockProductRepo{
		products:     map[string]*domain.Product{"SKU-1": prod},
		productsByID: map[int]*domain.Product{10: prod},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	// Non-restore update with empty Name must preserve existing Name instead of wiping it to ""
	falseVal := false
	err := svc.UpdateProduct(context.Background(), 1, 10, catalog_dto.UpdateProductRequest{
		SKU:      "SKU-1",
		Name:     "   ",
		IsActive: &falseVal,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prod.Name != "Nama Asli" {
		t.Fatalf("expected existing name preserved, got %q", prod.Name)
	}

	// Non-existent product returns ErrProductNotFound
	if err := svc.UpdateProduct(context.Background(), 1, 999, catalog_dto.UpdateProductRequest{SKU: "X", Name: "Y"}); !errors.Is(err, domain.ErrProductNotFound) {
		t.Fatalf("expected ErrProductNotFound, got %v", err)
	}

	// Duplicate SKU on Create maps MySQL 1062 -> ErrDuplicateSKU
	prodRepo.createErr = &mysql.MySQLError{Number: 1062, Message: "Duplicate entry"}
	if _, err := svc.CreateProduct(context.Background(), 1, catalog_dto.CreateProductRequest{SKU: "SKU-1", Name: "Dup"}); !errors.Is(err, domain.ErrDuplicateSKU) {
		t.Fatalf("expected ErrDuplicateSKU, got %v", err)
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
		t.Fatalf("expected components to be cleared, got %+v", prodRepo.components[6740])
	}
}

func TestLinkMediaToProduct_NoDuplicateAndSinglePrimary(t *testing.T) {
	ctx := context.Background()
	auditRepo := &mockAuditRepo{}
	prodRepo := &mockProductRepo{
		detailsByID: map[int]*catalog_dto.ProductDetailResponse{
			1: {ID: 1, Images: []catalog_dto.ProductImage{{ID: 10, IsPrimary: true}}},
			2: {ID: 2, Images: []catalog_dto.ProductImage{}},
		},
		alreadyLinked: map[int]map[int]bool{
			1: {50: true},
		},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, auditRepo, &mockCategoryRepo{})

	// Product 1 already has a primary image AND media 50 linked -> media 50 skipped, media 51 linked with isPrimary=0
	if err := svc.LinkMediaToProduct(ctx, 1, []int{50, 51, 51}, 9); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	links1 := prodRepo.linkedMedia[1]
	if len(links1) != 1 || links1[0].mediaID != 51 || links1[0].isPrimary != 0 {
		t.Fatalf("expected single non-primary link for media 51, got %+v", links1)
	}

	// Product 2 has NO primary yet -> first becomes primary (1), second non-primary (0)
	if err := svc.LinkMediaToProduct(ctx, 2, []int{60, 61}, 9); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	links2 := prodRepo.linkedMedia[2]
	if len(links2) != 2 || links2[0].isPrimary != 1 || links2[1].isPrimary != 0 {
		t.Fatalf("expected first primary=1 second=0, got %+v", links2)
	}

	// Empty or non-positive media IDs rejected
	if err := svc.LinkMediaToProduct(ctx, 2, []int{0}, 9); !errors.Is(err, domain.ErrEmptyMediaIDs) {
		t.Fatalf("expected ErrEmptyMediaIDs, got %v", err)
	}
}

func TestGetHistoricalStockTimeline_GuardsPaginationAndBuildings(t *testing.T) {
	bA := "Gedung A"
	bB := "Gedung B"
	loc1 := 1
	loc2 := 2
	prodRepo := &mockProductRepo{
		totalStock:     100,
		movementsCount: 1,
		newerSum:       10,
		movements: []catalog_port.RawStockMovement{
			{ID: 1, Quantity: 20, FromLocationID: &loc1, ToLocationID: &loc2, FromBuilding: &bB, ToBuilding: &bA, MovementType: "TRANSFER"},
		},
	}
	svc := usecase.NewProductUseCase(&mockTxManager{}, prodRepo, &mockAuditRepo{}, &mockCategoryRepo{})

	res, err := svc.GetHistoricalStockTimeline(context.Background(), 1, -2, 0, []string{"  ", "Gedung A", "Gedung A"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prodRepo.lastOffsetArg != 0 || prodRepo.lastLimitArg != 100 {
		t.Fatalf("expected sanitized offset=0 limit=100, got offset=%d limit=%d", prodRepo.lastOffsetArg, prodRepo.lastLimitArg)
	}
	if len(prodRepo.lastBuildingsArg) != 1 || prodRepo.lastBuildingsArg[0] != "Gedung A" {
		t.Fatalf("expected deduplicated clean buildings [Gedung A], got %v", prodRepo.lastBuildingsArg)
	}
	rows := res["data"].([]catalog_dto.ProductStockTimelineResponse)
	if len(rows) != 1 || rows[0].BalanceAfter != 90 || rows[0].NetChange != 20 {
		t.Fatalf("unexpected timeline row: %+v", rows)
	}
}

func TestCategoryUseCase_CRUDValidationAndTx(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockTxManager{}
	repo := &mockCategoryRepo{}
	uc := usecase.NewCategoryUseCase(txMgr, repo)

	// Invalid blank category name
	trueVal := true
	if _, err := uc.CreateCategory(ctx, catalog_dto.CreateCategoryRequest{Name: "   ", IsActive: &trueVal}); !errors.Is(err, domain.ErrInvalidCategoryName) {
		t.Fatalf("expected ErrInvalidCategoryName, got %v", err)
	}

	// Valid create trims name and runs inside tx
	cat, err := uc.CreateCategory(ctx, catalog_dto.CreateCategoryRequest{Name: "  Elektronik  ", IsActive: &trueVal})
	if err != nil || cat.Name != "Elektronik" || txMgr.calls != 1 {
		t.Fatalf("unexpected create result: cat=%+v tx=%d err=%v", cat, txMgr.calls, err)
	}

	// Invalid status filter rejected
	if _, err := uc.GetCategories(ctx, "invalid"); !errors.Is(err, domain.ErrInvalidCategoryStatus) {
		t.Fatalf("expected ErrInvalidCategoryStatus, got %v", err)
	}
	// Empty repo returns non-nil empty slice
	cats, err := uc.GetCategories(ctx, "archived")
	if err != nil || cats == nil || repo.lastStatus != domain.CategoryStatusArchived {
		t.Fatalf("expected non-nil empty slice for archived status, got cats=%v status=%q err=%v", cats, repo.lastStatus, err)
	}

	// Update maps sql.ErrNoRows -> ErrCategoryNotFound
	repo.updateErr = sql.ErrNoRows
	if err := uc.UpdateCategory(ctx, 99, catalog_dto.UpdateCategoryRequest{Name: "Baru"}); !errors.Is(err, domain.ErrCategoryNotFound) {
		t.Fatalf("expected ErrCategoryNotFound, got %v", err)
	}
}
