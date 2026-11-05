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
}

type LocationRepository interface {
	database.BaseRepository[domain.Location]
	Create(ctx context.Context, location *domain.Location) error
	Update(ctx context.Context, location *domain.Location) error
	GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error)
	// Stock Management Helpers
	GetStockAtLocation(ctx context.Context, productID int, locationID int, lockForUpdate bool) (int, error)
	FindBestStock(ctx context.Context, productID int, qtyNeeded int, purpose string) (*int, error)
	FindAvailableStockLocations(ctx context.Context, productID int, purpose string, building string) ([]domain.AvailableLocationStock, error)
	FindFulfillmentSourceStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error)
	FindReplenishmentCandidateStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error)
	UpdateFulfillmentSourceFlag(ctx context.Context, locationID int, isFulfillmentSource bool) error
	IncrementStock(ctx context.Context, productID int, locationID int, qty int) error
	DeductStock(ctx context.Context, productID int, locationID int, qty int) error
	ReserveStock(ctx context.Context, productID int, locationID int, qty int) error
	ReleaseStock(ctx context.Context, productID int, locationID int, qty int) error
}


type ReturnRepository interface {
	GetPendingReturns(ctx context.Context, params map[string]interface{}) ([]map[string]interface{}, int, error)
	GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error)
	GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error)
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
	GetByReference(ctx context.Context, refType string, refID string) (*domain.StockTransaction, error)
	GetHeldTransactions(ctx context.Context, building string) ([]domain.StockTransaction, error)
	UpdateTransactionTx(ctx context.Context, trx *domain.StockTransaction) error
	SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error
}

type StockQueryRepository interface {
	GetBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error)
}

type OutboxRepository interface {
	SaveTx(ctx context.Context, event *domain.OutboxEvent) error
	GetPendingEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error)
	MarkAsPublished(ctx context.Context, id int64) error
	IncrementRetry(ctx context.Context, id int64) error
}

type KeljaClient interface {
	FetchRecentFulfillments(ctx context.Context, page int, perPage int) ([]domain.KeljaFulfillmentSummary, error)
	FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (*domain.KeljaFulfillmentDetail, error)
}

// SlotRepository defines outbound persistence operations for locational metadata slots and logs.
type SlotRepository interface {
	GetSlots(ctx context.Context, productID int, locationID int) ([]domain.ProductLocationSlot, error)
	GetSlotByID(ctx context.Context, id int) (*domain.ProductLocationSlot, error)
	CreateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error
	UpdateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error
	DeleteSlot(ctx context.Context, id int) error
	SetPrimarySlot(ctx context.Context, productID int, locationID int, slotID int) error
	CreateSlotLog(ctx context.Context, log *domain.ProductLocationSlotLog) error
	GetSlotLogs(ctx context.Context, productID int, locationID int, limit int, offset int) ([]domain.ProductLocationSlotLog, int, error)
	GetSlotsByProductAndLocations(ctx context.Context, productID int, locationIDs []int) (map[int][]domain.ProductLocationSlot, error)
}



