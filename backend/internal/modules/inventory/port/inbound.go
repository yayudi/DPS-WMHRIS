package port

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

type InvestigationUseCase interface {
	GetDuplicateTransactions(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (interface{}, error)
	RevertTransaction(ctx context.Context, transactionID int, userID int) error
}

type LocationUseCase interface {
	CreateLocation(ctx context.Context, userID int, req inventory_dto.CreateLocationRequest) (*domain.Location, error)
	GetAllLocations(ctx context.Context) ([]domain.Location, error)
	UpdateLocation(ctx context.Context, userID int, locationID int, req inventory_dto.UpdateLocationRequest) error
	DeleteLocation(ctx context.Context, userID int, locationID int) error
	GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error)
}

type PickingUseCase interface {
	GetPendingItems(ctx context.Context) ([]inventory_dto.PendingPickingItemResponse, error)
	GetHistoryItems(ctx context.Context, limit int) ([]inventory_dto.HistoryPickingItemResponse, error)
	GetPickingDetail(ctx context.Context, pickingListID int) ([]inventory_dto.PickingListDetailResponse, error)

	CompletePickingItems(ctx context.Context, req inventory_dto.CompletePickingRequest, userID int) (string, []string, error)
	VoidPickingList(ctx context.Context, pickingListID int, userID int) error
	RetryBackorders(ctx context.Context, pickingListID int) (string, error)
	RetryBackordersBatch(ctx context.Context, req inventory_dto.RetryBackordersBatchRequest) (string, error)
	ProcessSalesImport(ctx context.Context, jobID int, filePath string, source string, userID int, isDryRun bool, locationPurpose string, shopName string) error
}

type ReturnUseCase interface {
	GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error)
	GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error)
	GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error)
	ApproveReturn(ctx context.Context, userID int, req inventory_dto.ApproveReturnRequest) error
	CreateManualReturn(ctx context.Context, userID int, req inventory_dto.CreateManualReturnRequest) error
}

type StockRequestUseCase interface {
	CreateStockRequest(ctx context.Context, userID int, req inventory_dto.CreateStockRequest) (*domain.StockRequest, error)
	GetAllStockRequests(ctx context.Context) ([]domain.StockRequest, error)
	ApproveStockRequest(ctx context.Context, id int, userID int, roleID int) error
	RejectStockRequest(ctx context.Context, id int, userID int, roleID int) error
	DispatchStockRequest(ctx context.Context, id int, userID int, roleID int) error
	CompleteStockRequest(ctx context.Context, id int, req inventory_dto.CompleteStockRequest, userID int, roleID int) error
	BulkActionStockRequest(ctx context.Context, req inventory_dto.BulkActionStockRequest, userID int, roleID int) (map[string]interface{}, error)
}

type StockUseCase interface {
	MoveStock(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error
	GetAllStocks(ctx context.Context) ([]map[string]interface{}, error)
	ProcessBatchMovements(ctx context.Context, req inventory_dto.BatchProcessRequest, userID int, userRoleID int) error
	GetMovementTypes(ctx context.Context) ([]string, error)
	GetBatchLogs(ctx context.Context, filter inventory_dto.BatchLogFilter) (utils.PaginatedResult[inventory_dto.BatchLogResponse], error)
	GetStockHistory(ctx context.Context, filter inventory_dto.StockHistoryFilter) (utils.PaginatedResult[inventory_dto.StockHistoryResponse], error)
	GenerateInboundTemplate(ctx context.Context) (*excelize.File, error)
	GenerateAdjustmentTemplate(ctx context.Context) (*excelize.File, error)
	ValidateReturn(ctx context.Context, req inventory_dto.ValidateReturnRequest, userID int) error
	ProcessStockImport(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) error
	ProcessImportBatchInbound(ctx context.Context, jobID int, filePath string, userID int, isDryRun bool) (string, error)
}
