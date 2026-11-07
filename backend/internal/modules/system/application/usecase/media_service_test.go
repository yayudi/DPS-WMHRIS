package usecase_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	catalog_domain "github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

type mockMediaRepo struct {
	mediaMap map[string]int
}

func (m *mockMediaRepo) GetMediaAssets(ctx context.Context, page, limit int, filter system_mysql.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error) { return utils.PaginatedResult[system_dto.MediaAssetResponse]{}, nil }
func (m *mockMediaRepo) GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error) { return nil, nil }
func (m *mockMediaRepo) CreateMediaAsset(ctx context.Context, payload map[string]interface{}) (int, error) { return 1, nil }
func (m *mockMediaRepo) GetMediaAssetByHash(ctx context.Context, hash string) (*int, error) { return nil, nil }
func (m *mockMediaRepo) InsertTrashQueue(ctx context.Context, r2Key string) error { return nil }
func (m *mockMediaRepo) DeleteMediaAsset(ctx context.Context, mediaID int) error { return nil }
func (m *mockMediaRepo) GetMediaAssetByID(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error) { return nil, nil }
func (m *mockMediaRepo) GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]system_dto.MediaAssetResponse, error) { return nil, nil }
func (m *mockMediaRepo) UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error { return nil }
func (m *mockMediaRepo) UpdateMediaTitle(ctx context.Context, mediaID int, title string) error { return nil }
func (m *mockMediaRepo) FindMediaIDByPathLike(ctx context.Context, searchPath string) (*int, error) {
	if id, ok := m.mediaMap[searchPath]; ok {
		return &id, nil
	}
	return nil, nil
}

type mockMediaProductRepo struct {
	linked map[int]bool
}

func (m *mockMediaProductRepo) Create(ctx context.Context, product *catalog_domain.Product) error { return nil }
func (m *mockMediaProductRepo) Update(ctx context.Context, product *catalog_domain.Product) error { return nil }
func (m *mockMediaProductRepo) GetBySKUs(ctx context.Context, skus []string) ([]catalog_domain.Product, error) {
	if len(skus) > 0 && skus[0] == "SKU-TEST" {
		return []catalog_domain.Product{{BaseEntity: kernel.BaseEntity{ID: 100}, SKU: "SKU-TEST"}}, nil
	}
	return nil, nil
}
func (m *mockMediaProductRepo) GetProductIDBySKUTx(ctx context.Context, sku string) (int, error) { return 0, nil }
func (m *mockMediaProductRepo) CreateProductTx(ctx context.Context, product *catalog_domain.Product) (int, error) { return 0, nil }
func (m *mockMediaProductRepo) LinkMediaToProduct(ctx context.Context, productID int, mediaID int, isPrimary int) error {
	m.linked[productID] = true
	return nil
}
func (m *mockMediaProductRepo) IsMediaLinkedToProduct(ctx context.Context, productID int, mediaID int) (bool, error) {
	return m.linked[productID], nil
}
func (m *mockMediaProductRepo) DeleteProductImage(ctx context.Context, imageID int) error { return nil }
func (m *mockMediaProductRepo) SetPrimaryImage(ctx context.Context, productID int, imageID int) error { return nil }
func (m *mockMediaProductRepo) GetProductsWithFilters(ctx context.Context, filters catalog_dto.ProductFilterRequest) ([]catalog_dto.ProductDetailResponse, int, error) { return nil, 0, nil }
func (m *mockMediaProductRepo) SearchProducts(ctx context.Context, keyword string, locationID string, inStockOnly bool, page int, limit int) ([]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductMapWithComponents(ctx context.Context, skus []string) (map[string]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetAllActiveProducts(ctx context.Context) ([]catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductDetailWithStock(ctx context.Context, id int) (*catalog_dto.ProductDetailResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductStockDetails(ctx context.Context, id int) ([]catalog_dto.ProductStockDetailResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductHistory(ctx context.Context, id int) ([]catalog_dto.ProductHistoryResponse, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductLastPriceUpdate(ctx context.Context, id int) (*time.Time, error) { return nil, nil }
func (m *mockMediaProductRepo) GetProductTotalStock(ctx context.Context, productID int, buildings []string) (int, error) { return 0, nil }
func (m *mockMediaProductRepo) GetProductStockMovementsCount(ctx context.Context, productID int, buildings []string) (int, error) { return 0, nil }
func (m *mockMediaProductRepo) GetSumOfNewerStockMovements(ctx context.Context, productID int, offset int, buildings []string) (int, error) { return 0, nil }
func (m *mockMediaProductRepo) GetProductStockMovementsPaginated(ctx context.Context, productID int, limit int, offset int, buildings []string) ([]catalog_port.RawStockMovement, error) { return nil, nil }
func (m *mockMediaProductRepo) FindByID(ctx context.Context, id int) (*catalog_domain.Product, error) { return nil, nil }
func (m *mockMediaProductRepo) FindAll(ctx context.Context) ([]catalog_domain.Product, error) { return nil, nil }
func (m *mockMediaProductRepo) Delete(ctx context.Context, id int) error { return nil }
func (m *mockMediaProductRepo) SoftDelete(ctx context.Context, id int) error { return nil }
func (m *mockMediaProductRepo) Restore(ctx context.Context, id int) error { return nil }

type mockStorageService struct{}
func (m *mockStorageService) GeneratePresignedUploadUrl(ctx context.Context, filename string, mimeType string, folder string) (string, string, string, error) { return "", "", "", nil }
func (m *mockStorageService) DeleteFromR2(ctx context.Context, key string) (bool, error) { return true, nil }
func (m *mockStorageService) UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (string, error) { return "", nil }
func (m *mockStorageService) GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error) { return "", nil }

func TestProcessMediaLinkImport_NoPanic(t *testing.T) {
	mediaRepo := &mockMediaRepo{
		mediaMap: map[string]int{"sample_image.jpg": 50},
	}
	productRepo := &mockMediaProductRepo{
		linked: make(map[int]bool),
	}

	svc := usecase.NewMediaService(&mockTxManager{}, mediaRepo, productRepo, &mockStorageService{})

	tempDir := t.TempDir()
	xlsxPath := filepath.Join(tempDir, "bulk_media.xlsx")
	f := excelize.NewFile()
	f.SetCellValue("Sheet1", "A1", "SKU")
	f.SetCellValue("Sheet1", "B1", "Image_URL")
	f.SetCellValue("Sheet1", "A2", "SKU-TEST")
	f.SetCellValue("Sheet1", "B2", "sample_image.jpg")
	if err := f.SaveAs(xlsxPath); err != nil {
		t.Fatalf("failed to create test excel: %v", err)
	}

	summary, err := svc.ProcessMediaLinkImport(context.Background(), xlsxPath, 1)
	if err != nil {
		t.Fatalf("expected success without panic, got error: %v", err)
	}

	if !productRepo.linked[100] {
		t.Errorf("expected product 100 to be linked to media, got summary: %s", summary)
	}
}
