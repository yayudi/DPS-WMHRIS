package port

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type InvestigationRepository interface {
	GetDuplicateGroups(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) ([]domain.DuplicateTransactionItem, error)
	CountDuplicateGroups(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (int, error)
	FindFulfilmentListDetailsByInvoices(ctx context.Context, invoiceIds []string) ([]map[string]interface{}, error)
	FindFulfilmentListDetailsByItemIds(ctx context.Context, itemIds []int) ([]map[string]interface{}, error)
}

type LocationRepository interface {
	database.BaseRepository[domain.Location]
	Create(ctx context.Context, location *domain.Location) error
	Update(ctx context.Context, location *domain.Location) error
	GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error)
	// Stock Management Helpers
	GetStockAtLocation(ctx context.Context, productID int, locationID int, lockForUpdate bool) (int, error)
	FindBestStock(ctx context.Context, productID int, qtyNeeded int, purpose string) (*int, error)
	IncrementStock(ctx context.Context, productID int, locationID int, qty int) error
	DeductStock(ctx context.Context, productID int, locationID int, qty int) error
	ReserveStock(ctx context.Context, productID int, locationID int, qty int) error
	ReleaseStock(ctx context.Context, productID int, locationID int, qty int) error
}

type FulfilmentRepository interface {
	GetPendingItems(ctx context.Context, filter inventory_dto.PendingFulfilmentFilter) ([]inventory_dto.PendingFulfilmentItemResponse, int, error)
	GetPendingFilterOptions(ctx context.Context) (inventory_dto.PendingFilterOptionsResponse, error)
	GetHistoryItems(ctx context.Context, limit int) ([]inventory_dto.HistoryFulfilmentItemResponse, error)
	GetListDetails(ctx context.Context, fulfilmentListID int) ([]inventory_dto.FulfilmentListDetailResponse, error)

	GetHeaderByID(ctx context.Context, id int) (*domain.FulfilmentList, error)
	GetItemsByIDs(ctx context.Context, itemIDs []int) ([]domain.FulfilmentListItem, error)
	CountPendingItems(ctx context.Context, fulfilmentListID int, statuses ...string) (int, error)

	UpdateSuggestedLocation(ctx context.Context, itemID int, locationID *int) error
	UpdateItemStatus(ctx context.Context, itemID int, status string) error
	ValidateItem(ctx context.Context, itemID int, locationID int, status string) error
	ValidateHeader(ctx context.Context, listID int, status string) error

	VoidHeader(ctx context.Context, listID int) (int64, error)
	VoidItemsByListID(ctx context.Context, listID int) error

	CreateFulfilmentListTx(ctx context.Context, header *domain.FulfilmentList) (int, error)
	CreateFulfilmentListItemTx(ctx context.Context, item *domain.FulfilmentListItem) error
	ExistsByInvoiceNo(ctx context.Context, invoiceNo string) (bool, error)

	GetItemsToRestock(ctx context.Context, listID int) ([]domain.FulfilmentListItem, error)
	GetUnfulfillableItems(ctx context.Context, listID int) ([]domain.FulfilmentListItem, error)
	GetUnfulfillableItemsByProductID(ctx context.Context, productID int) ([]domain.FulfilmentListItem, error)
	GetPendingAndBackorderItems(ctx context.Context, listIDs []int) ([]domain.FulfilmentListItem, error)
}

type ReturnRepository interface {
	GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error)
	GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error)
	GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error)
	GetFulfilmentItemById(ctx context.Context, id int) (*domain.FulfilmentListItem, error)
	CompleteReturnItem(ctx context.Context, itemID int, condition string, notes string, locationID int) error
	DecreaseItemQty(ctx context.Context, itemID int, qtyToDeduct int) error
	CreateSplitReturnItem(ctx context.Context, originItem *domain.FulfilmentListItem, qtyReturn int, condition string, notes string, locationID int) (int, error)
	CreateManualReturn(ctx context.Context, manualReturn *domain.ManualReturn) error
}

type StockRepository interface {
	GetStockByLocation(ctx context.Context, productID int, locationID int) (*domain.StockLocation, error)
	UpsertStockLocation(ctx context.Context, stock *domain.StockLocation) error
	RecordMovement(ctx context.Context, movement *domain.StockMovement) error
	GetAllStocks(ctx context.Context) ([]map[string]interface{}, error)
	GetMovementTypes(ctx context.Context) ([]string, error)
	GetBatchLogs(ctx context.Context, filter inventory_dto.BatchLogFilter) (utils.PaginatedResult[inventory_dto.BatchLogResponse], error)
	GetStockHistory(ctx context.Context, filter inventory_dto.StockHistoryFilter) (utils.PaginatedResult[inventory_dto.StockHistoryResponse], error)
}

type StockRequestRepository interface {
	database.BaseRepository[domain.StockRequest]
	CreateTx(ctx context.Context, request *domain.StockRequest) error
	CreateItemTx(ctx context.Context, item *domain.StockRequestItem) error
	UpdateStatusTx(ctx context.Context, id int, status string) error
	UpdateItemReceivedQtyTx(ctx context.Context, itemID int, qty int) error
	FindItemsByRequestID(ctx context.Context, reqID int) ([]domain.StockRequestItem, error)
	FindAllWithJoins(ctx context.Context) ([]domain.StockRequest, error)
}

type StockTransactionRepository interface {
	CreateTx(ctx context.Context, trx *domain.StockTransaction) error
	GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error)
	GetByTransactionNo(ctx context.Context, trxNo string) (*domain.StockTransaction, error)
	SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error
}

type StockQueryRepository interface {
	GetBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error)
}

type KeljaERPClient interface {
	FetchFulfillments(ctx context.Context, page int, perPage int) ([]map[string]interface{}, error)
	FetchAllFulfillments(ctx context.Context) ([]map[string]interface{}, error)
	FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (map[string]interface{}, error)
	SendCallbackDone(ctx context.Context, fulfillmentID int, expeditionID int, awb string, action string) error
}

