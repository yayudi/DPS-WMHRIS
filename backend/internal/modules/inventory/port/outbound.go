package port

import (
	"context"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

// InvestigationRepository defines outbound persistence operations for duplicate transaction investigations.
type InvestigationRepository interface {
	GetDuplicateGroups(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) ([]domain.DuplicateTransactionItem, error)
	CountDuplicateGroups(ctx context.Context, req inventory_dto.GetDuplicateTransactionsRequest) (int, error)
}

// LocationRepository defines outbound persistence operations for locations and per-location stock balances.
type LocationRepository interface {
	database.BaseRepository[domain.Location]
	Create(ctx context.Context, location *domain.Location) error
	Update(ctx context.Context, location *domain.Location) error
	GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error)
	// Stock management helpers
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

// ReturnRepository defines outbound persistence operations for marketplace and manual returns.
type ReturnRepository interface {
	GetPendingReturns(ctx context.Context, params map[string]any) ([]map[string]any, int, error)
	GetMarketplaceReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.MarketplaceReturnItem], error)
	GetManualReturnHistory(ctx context.Context, page, limit int, search string) (utils.PaginatedResult[domain.ManualReturnItem], error)
	CreateManualReturn(ctx context.Context, manualReturn *domain.ManualReturn) error
}

// SalesChannelRepository defines outbound persistence operations for sales channels.
type SalesChannelRepository interface {
	FindAll(ctx context.Context, activeOnly bool) ([]inventory_dto.SalesChannelResponse, error)
	FindByID(ctx context.Context, id int) (*inventory_dto.SalesChannelResponse, error)
	Insert(ctx context.Context, req inventory_dto.CreateSalesChannelRequest) (int, error)
	Update(ctx context.Context, id int, req inventory_dto.UpdateSalesChannelRequest) (int, error)
	Delete(ctx context.Context, id int) (int, error)
}

// StockRepository defines outbound persistence operations for stock locations and movement history.
type StockRepository interface {
	GetStockByLocation(ctx context.Context, productID int, locationID int) (*domain.StockLocation, error)
	UpsertStockLocation(ctx context.Context, stock *domain.StockLocation) error
	RecordMovement(ctx context.Context, movement *domain.StockMovement) error
	GetAllStocks(ctx context.Context) ([]map[string]any, error)
	GetMovementTypes(ctx context.Context) ([]string, error)
	GetBatchLogs(ctx context.Context, filter inventory_dto.BatchLogFilter) (utils.PaginatedResult[inventory_dto.BatchLogResponse], error)
	GetStockHistory(ctx context.Context, filter inventory_dto.StockHistoryFilter) (utils.PaginatedResult[inventory_dto.StockHistoryResponse], error)
}

// StockRequestRepository defines outbound persistence operations for stock transfer and opname requests.
type StockRequestRepository interface {
	database.BaseRepository[domain.StockRequest]
	CreateTx(ctx context.Context, request *domain.StockRequest) error
	CreateItemTx(ctx context.Context, item *domain.StockRequestItem) error
	UpdateStatusTx(ctx context.Context, id int, status string) error
	UpdateItemReceivedQtyTx(ctx context.Context, itemID int, qty int) error
	FindItemsByRequestID(ctx context.Context, reqID int) ([]domain.StockRequestItem, error)
	FindItemsByRequestIDs(ctx context.Context, reqIDs []int) (map[int][]domain.StockRequestItem, error)
	FindAllWithJoins(ctx context.Context) ([]domain.StockRequest, error)
}

// StockTransactionRepository defines outbound persistence operations for inv_transactions and movement lines.
type StockTransactionRepository interface {
	CreateTx(ctx context.Context, trx *domain.StockTransaction) error
	GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error)
	GetByTransactionNo(ctx context.Context, trxNo string) (*domain.StockTransaction, error)
	GetByReference(ctx context.Context, refType string, refID string) (*domain.StockTransaction, error)
	GetHeldTransactions(ctx context.Context, building string) ([]domain.StockTransaction, error)
	UpdateTransactionTx(ctx context.Context, trx *domain.StockTransaction) error
	SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error
}

// StockQueryRepository defines outbound read operations for stock balances.
type StockQueryRepository interface {
	GetBalances(ctx context.Context, locationID *int, productID *int) ([]inventory_dto.StockBalanceResponse, error)
}

// OutboxRepository defines outbound persistence operations for transactional outbox events.
type OutboxRepository interface {
	SaveTx(ctx context.Context, event *domain.OutboxEvent) error
	GetPendingEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error)
	MarkAsPublished(ctx context.Context, id int64) error
	IncrementRetry(ctx context.Context, id int64) error
}

// KeljaClient defines outbound REST API operations against the Kelja.id ERP service.
type KeljaClient interface {
	FetchRecentFulfillments(ctx context.Context, page int, perPage int) ([]domain.KeljaFulfillmentSummary, error)
	FetchFulfillmentDetail(ctx context.Context, fulfillmentID int) (*domain.KeljaFulfillmentDetail, error)
}

// SlotRepository defines outbound persistence operations for locational metadata slots and audit logs.
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
