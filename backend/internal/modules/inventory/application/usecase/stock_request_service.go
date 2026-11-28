package usecase

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

type stockRequestServiceImpl struct {
	txManager           database.TransactionManager
	stockRequestRepo    inventory_port.StockRequestRepository
	stockService        inventory_port.StockUseCase
	notificationService system_port.NotificationService
}

// NewStockRequestUseCase creates a StockRequestUseCase wired with transactions, stock movements, and notifications.
func NewStockRequestUseCase(
	txManager database.TransactionManager,
	stockRequestRepo inventory_port.StockRequestRepository,
	stockService inventory_port.StockUseCase,
	notificationService system_port.NotificationService,
) inventory_port.StockRequestUseCase {
	return &stockRequestServiceImpl{
		txManager:           txManager,
		stockRequestRepo:    stockRequestRepo,
		stockService:        stockService,
		notificationService: notificationService,
	}
}

func (s *stockRequestServiceImpl) loadRequestWithItems(ctx context.Context, id int) (*domain.StockRequest, error) {
	request, err := s.stockRequestRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrStockRequestNotFound
		}
		return nil, err
	}
	if request == nil {
		return nil, domain.ErrStockRequestNotFound
	}

	items, err := s.stockRequestRepo.FindItemsByRequestID(ctx, request.ID)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.StockRequestItem{}
	}
	request.Items = items
	return request, nil
}

func (s *stockRequestServiceImpl) CreateStockRequest(ctx context.Context, userID int, req inventory_dto.CreateStockRequest) (*domain.StockRequest, error) {
	reqType := strings.TrimSpace(req.Type)
	if err := domain.ValidateStockRequestType(reqType); err != nil {
		return nil, err
	}

	switch reqType {
	case domain.StockRequestTypeTransfer:
		if req.FromLocationID == nil || req.ToLocationID == nil || *req.FromLocationID <= 0 || *req.ToLocationID <= 0 {
			return nil, apperror.Validation("wms.stock_request.err_from_to_location_required", "Lokasi asal dan tujuan harus diisi untuk transfer.", nil)
		}
		if *req.FromLocationID == *req.ToLocationID {
			return nil, apperror.Validation("wms.stock_request.err_same_locations", "Lokasi asal dan tujuan tidak boleh sama.", nil)
		}
	case domain.StockRequestTypeStockOpname:
		if req.ToLocationID == nil || *req.ToLocationID <= 0 {
			return nil, apperror.Validation("wms.stock_request.err_opname_location_required", "Lokasi opname harus diisi.", nil)
		}
	}

	if len(req.Items) == 0 {
		return nil, domain.ErrStockRequestEmptyItems
	}
	for _, item := range req.Items {
		if item.ProductID <= 0 || item.Quantity <= 0 {
			return nil, apperror.Validation("wms.stock_request.err_invalid_item", "Produk dan jumlah permintaan harus bernilai positif.", nil)
		}
	}

	dateStr := time.Now().Format("060102")
	n, err := rand.Int(rand.Reader, big.NewInt(9000))
	if err != nil {
		return nil, apperror.Internal("wms.stock_request.err_rand_failed", "Gagal memproses nomor request (rand error)", err)
	}
	randStr := fmt.Sprintf("%04d", 1000+n.Int64())
	requestNumber := fmt.Sprintf("SR-%s-%s", dateStr, randStr)

	request := &domain.StockRequest{
		RequestNumber:  requestNumber,
		Type:           reqType,
		RequesterID:    userID,
		FromLocationID: req.FromLocationID,
		ToLocationID:   req.ToLocationID,
		Status:         domain.StockRequestStatusPending,
		Notes:          strings.TrimSpace(req.Notes),
		Items:          make([]domain.StockRequestItem, 0, len(req.Items)),
	}

	err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.stockRequestRepo.CreateTx(txCtx, request); err != nil {
			return err
		}

		for _, item := range req.Items {
			reqItem := &domain.StockRequestItem{
				StockRequestID:   request.ID,
				ProductID:        item.ProductID,
				Quantity:         item.Quantity,
				ReceivedQuantity: 0,
			}
			if err := s.stockRequestRepo.CreateItemTx(txCtx, reqItem); err != nil {
				return err
			}
			request.Items = append(request.Items, *reqItem)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// Send read-time i18n notification to approvers
	if s.notificationService != nil {
		notifPayload := map[string]any{
			"requestId": request.ID,
			"type":      request.Type,
			"_i18n": system_dto.NotificationI18nMeta{
				TitleKey:   "wms.notification.stock_request_new_title",
				MessageKey: "wms.notification.stock_request_new_msg",
				Params: map[string]any{
					"type": request.Type,
				},
			},
		}
		if err := s.notificationService.NotifyUsersByPermission(
			ctx, "approve-stock-requests", "WMS", "Permintaan Stok Baru",
			fmt.Sprintf("Permintaan stok baru (%s) telah dibuat dan menunggu persetujuan.", request.Type),
			notifPayload, &userID, true,
		); err != nil {
			log.Printf("Failed to send stock request notification: %v", err)
		}
	}

	return request, nil
}

func (s *stockRequestServiceImpl) GetAllStockRequests(ctx context.Context) ([]domain.StockRequest, error) {
	requests, err := s.stockRequestRepo.FindAllWithJoins(ctx)
	if err != nil {
		return nil, err
	}
	if len(requests) == 0 {
		return []domain.StockRequest{}, nil
	}

	reqIDs := make([]int, len(requests))
	for i := range requests {
		reqIDs[i] = requests[i].ID
	}

	itemsByReqID, err := s.stockRequestRepo.FindItemsByRequestIDs(ctx, reqIDs)
	if err != nil {
		return nil, err
	}

	for i := range requests {
		if items, ok := itemsByReqID[requests[i].ID]; ok && items != nil {
			requests[i].Items = items
		} else {
			requests[i].Items = []domain.StockRequestItem{}
		}
	}

	return requests, nil
}

func (s *stockRequestServiceImpl) ApproveStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		request, err := s.loadRequestWithItems(txCtx, id)
		if err != nil {
			return err
		}

		if request.Status != domain.StockRequestStatusPending {
			return apperror.Conflict("wms.stock_request.err_status_must_pending", "Hanya permintaan berstatus PENDING yang dapat disetujui.", nil)
		}
		if request.RequesterID == userID {
			return apperror.Forbidden("wms.stock_request.err_self_approval", "Anda tidak dapat menyetujui permintaan Anda sendiri.", nil)
		}

		if request.Type == domain.StockRequestTypeStockOpname {
			if len(request.Items) == 0 {
				return domain.ErrStockRequestEmptyItems
			}

			movements := make([]inventory_dto.BatchMovementRequest, 0, len(request.Items))
			for _, item := range request.Items {
				notes := fmt.Sprintf("Stock Request Opname %s", request.RequestNumber)
				movements = append(movements, inventory_dto.BatchMovementRequest{
					SKU:          item.SKU,
					Quantity:     item.Quantity,
					ToLocationID: request.ToLocationID,
					Notes:        &notes,
				})
			}

			if err := s.stockService.ProcessBatchMovements(txCtx, inventory_dto.BatchProcessRequest{
				Type:         "ADJUSTMENT",
				ToLocationID: request.ToLocationID,
				Notes:        &request.RequestNumber,
				Movements:    movements,
			}, userID, roleID); err != nil {
				return err
			}

			for _, item := range request.Items {
				if err := s.stockRequestRepo.UpdateItemReceivedQtyTx(txCtx, item.ID, item.Quantity); err != nil {
					return err
				}
			}

			return s.stockRequestRepo.UpdateStatusTx(txCtx, request.ID, domain.StockRequestStatusCompleted)
		}

		return s.stockRequestRepo.UpdateStatusTx(txCtx, request.ID, domain.StockRequestStatusApproved)
	})
}

func (s *stockRequestServiceImpl) RejectStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		request, err := s.stockRequestRepo.FindByID(txCtx, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrStockRequestNotFound
			}
			return err
		}
		if request == nil {
			return domain.ErrStockRequestNotFound
		}

		if request.Status != domain.StockRequestStatusPending {
			return apperror.Conflict("wms.stock_request.err_status_must_pending", "Hanya permintaan berstatus PENDING yang dapat ditolak.", nil)
		}

		return s.stockRequestRepo.UpdateStatusTx(txCtx, request.ID, domain.StockRequestStatusRejected)
	})
}

func (s *stockRequestServiceImpl) DispatchStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		request, err := s.loadRequestWithItems(txCtx, id)
		if err != nil {
			return err
		}

		if request.Status != domain.StockRequestStatusApproved {
			return apperror.Conflict("wms.stock_request.err_status_must_approved", "Hanya permintaan berstatus APPROVED yang dapat dikirim.", nil)
		}
		if request.Type == domain.StockRequestTypeStockOpname {
			return apperror.Validation("wms.stock_request.err_opname_no_dispatch", "Permintaan Stock Opname tidak memerlukan pengiriman.", nil)
		}
		if len(request.Items) == 0 {
			return domain.ErrStockRequestEmptyItems
		}

		movements := make([]inventory_dto.BatchMovementRequest, 0, len(request.Items))
		for _, item := range request.Items {
			notes := fmt.Sprintf("Pengiriman Permintaan Stok %s", request.RequestNumber)
			movements = append(movements, inventory_dto.BatchMovementRequest{
				SKU:            item.SKU,
				Quantity:       item.Quantity,
				FromLocationID: request.FromLocationID,
				Notes:          &notes,
			})
		}

		if err := s.stockService.ProcessBatchMovements(txCtx, inventory_dto.BatchProcessRequest{
			Type:           "TRANSFER_OUT",
			FromLocationID: request.FromLocationID,
			Notes:          &request.RequestNumber,
			Movements:      movements,
		}, userID, roleID); err != nil {
			return err
		}

		return s.stockRequestRepo.UpdateStatusTx(txCtx, request.ID, domain.StockRequestStatusShipped)
	})
}

func (s *stockRequestServiceImpl) CompleteStockRequest(ctx context.Context, id int, req inventory_dto.CompleteStockRequest, userID int, roleID int) error {
	receivedByProductID := make(map[int]int, len(req.ReceivedItems))
	for _, rItem := range req.ReceivedItems {
		if rItem.ReceivedQuantity < 0 {
			return apperror.Validation("wms.stock_request.err_invalid_received_qty", "Jumlah diterima tidak boleh negatif.", nil)
		}
		receivedByProductID[rItem.ProductID] = rItem.ReceivedQuantity
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		request, err := s.loadRequestWithItems(txCtx, id)
		if err != nil {
			return err
		}

		if request.Status != domain.StockRequestStatusShipped {
			return apperror.Conflict("wms.stock_request.err_status_must_shipped", "Hanya permintaan berstatus SHIPPED yang dapat diselesaikan.", nil)
		}
		if len(request.Items) == 0 {
			return domain.ErrStockRequestEmptyItems
		}

		movements := make([]inventory_dto.BatchMovementRequest, 0, len(request.Items))
		for _, item := range request.Items {
			rQty := item.Quantity
			if overrideQty, ok := receivedByProductID[item.ProductID]; ok {
				rQty = overrideQty
			}

			if err := s.stockRequestRepo.UpdateItemReceivedQtyTx(txCtx, item.ID, rQty); err != nil {
				return err
			}

			if rQty > 0 {
				notes := fmt.Sprintf("Penerimaan Permintaan Stok %s", request.RequestNumber)
				movements = append(movements, inventory_dto.BatchMovementRequest{
					SKU:          item.SKU,
					Quantity:     rQty,
					ToLocationID: request.ToLocationID,
					Notes:        &notes,
				})
			}
		}

		if len(movements) > 0 {
			if err := s.stockService.ProcessBatchMovements(txCtx, inventory_dto.BatchProcessRequest{
				Type:         "TRANSFER_IN",
				ToLocationID: request.ToLocationID,
				Notes:        &request.RequestNumber,
				Movements:    movements,
			}, userID, roleID); err != nil {
				return err
			}
		}

		return s.stockRequestRepo.UpdateStatusTx(txCtx, request.ID, domain.StockRequestStatusCompleted)
	})
}

func (s *stockRequestServiceImpl) BulkActionStockRequest(ctx context.Context, req inventory_dto.BulkActionStockRequest, userID int, roleID int) (map[string]any, error) {
	successCount := 0
	failedCount := 0
	details := make([]map[string]any, 0, len(req.RequestIds))

	for _, id := range req.RequestIds {
		var err error
		switch req.Action {
		case "APPROVE":
			err = s.ApproveStockRequest(ctx, id, userID, roleID)
		case "REJECT":
			err = s.RejectStockRequest(ctx, id, userID, roleID)
		}

		if err == nil {
			successCount++
			details = append(details, map[string]any{"id": id, "status": "success"})
		} else {
			failedCount++
			details = append(details, map[string]any{"id": id, "status": "failed", "reason": err.Error()})
		}
	}

	return map[string]any{
		"successCount": successCount,
		"failedCount":  failedCount,
		"details":      details,
	}, nil
}
