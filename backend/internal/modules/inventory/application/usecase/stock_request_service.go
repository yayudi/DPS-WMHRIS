package usecase

import (
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/database"

	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
)

type stockRequestServiceImpl struct {
	txManager           database.TransactionManager
	stockRequestRepo    inventory_port.StockRequestRepository
	stockService        inventory_port.StockUseCase
	notificationService system_usecase.NotificationService
}

func NewStockRequestUseCase(
	txManager database.TransactionManager,
	stockRequestRepo inventory_port.StockRequestRepository,
	stockService inventory_port.StockUseCase,
	notificationService system_usecase.NotificationService,
) inventory_port.StockRequestUseCase {
	return &stockRequestServiceImpl{
		txManager:           txManager,
		stockRequestRepo:    stockRequestRepo,
		stockService:        stockService,
		notificationService: notificationService,
	}
}

func (s *stockRequestServiceImpl) CreateStockRequest(ctx context.Context, userID int, req inventory_dto.CreateStockRequest) (*domain.StockRequest, error) {
	switch req.Type {
	case "TRANSFER":
		if req.FromLocationID == nil || req.ToLocationID == nil {
			return nil, errors.New("Lokasi asal dan tujuan harus diisi untuk transfer.")
		}
		if *req.FromLocationID == *req.ToLocationID {
			return nil, errors.New("Lokasi asal dan tujuan tidak boleh sama.")
		}
	case "STOCK_OPNAME":
		if req.ToLocationID == nil {
			return nil, errors.New("Lokasi opname harus diisi.")
		}
	}

	if len(req.Items) == 0 {
		return nil, errors.New("Minimal harus ada satu produk yang diminta.")
	}

	dateStr := time.Now().Format("060102")
	n, err := rand.Int(rand.Reader, big.NewInt(9000))
	if err != nil {
		return nil, errors.New("gagal memproses nomor request (rand error)")
	}
	randStr := fmt.Sprintf("%04d", 1000+n.Int64())
	requestNumber := fmt.Sprintf("SR-%s-%s", dateStr, randStr)

	request := &domain.StockRequest{
		RequestNumber:  requestNumber,
		Type:           req.Type,
		RequesterID:    userID,
		FromLocationID: req.FromLocationID,
		ToLocationID:   req.ToLocationID,
		Status:         "PENDING",
		Notes:          req.Notes,
	}

	err = s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if err := s.stockRequestRepo.CreateTx(ctx, request); err != nil {
			return err
		}

		for _, item := range req.Items {
			reqItem := &domain.StockRequestItem{
				StockRequestID:   request.ID,
				ProductID:        item.ProductID,
				Quantity:         item.Quantity,
				ReceivedQuantity: 0,
			}
			if err := s.stockRequestRepo.CreateItemTx(ctx, reqItem); err != nil {
				return err
			}
			request.Items = append(request.Items, *reqItem)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Notifikasi
	if err := s.notificationService.NotifyUsersByPermission(ctx, "approve-stock-requests", "WMS", "Permintaan Stok Baru",
		fmt.Sprintf("Permintaan stok baru (%s) telah dibuat dan menunggu persetujuan.", request.Type),
		map[string]interface{}{"requestId": request.ID, "type": request.Type}, &userID, true); err != nil {
		log.Printf("Failed to send notification: %v", err)
	}

	return request, nil
}

func (s *stockRequestServiceImpl) GetAllStockRequests(ctx context.Context) ([]domain.StockRequest, error) {
	requests, err := s.stockRequestRepo.FindAllWithJoins(ctx)
	if err != nil {
		return nil, err
	}

	for i := range requests {
		items, err := s.stockRequestRepo.FindItemsByRequestID(ctx, requests[i].ID)
		if err == nil {
			requests[i].Items = items
		} else {
			requests[i].Items = []domain.StockRequestItem{}
		}
	}

	return requests, nil
}

func (s *stockRequestServiceImpl) ApproveStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	request, err := s.stockRequestRepo.FindByID(ctx, id)
	if err != nil {
		return errors.New("Permintaan stok tidak ditemukan.")
	}

	if request.Status != "PENDING" {
		return errors.New("Hanya permintaan berstatus PENDING yang dapat disetujui.")
	}

	if request.RequesterID == userID {
		return errors.New("Anda tidak dapat menyetujui permintaan Anda sendiri.")
	}

	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if request.Type == "STOCK_OPNAME" {
			var movements []inventory_dto.BatchMovementRequest
			for _, item := range request.Items {
				notes := fmt.Sprintf("Stock Request Opname %s", request.RequestNumber)
				movements = append(movements, inventory_dto.BatchMovementRequest{
					SKU:          item.SKU,
					Quantity:     item.Quantity,
					ToLocationID: request.ToLocationID,
					Notes:        &notes,
				})
			}

			err = s.stockService.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
				Type:         "ADJUSTMENT",
				ToLocationID: request.ToLocationID,
				Notes:        &request.RequestNumber,
				Movements:    movements,
			}, userID, roleID)

			if err != nil {
				return err
			}

			for _, item := range request.Items {
				if err := s.stockRequestRepo.UpdateItemReceivedQtyTx(ctx, item.ID, item.Quantity); err != nil {
					return err
				}
			}

			if err := s.stockRequestRepo.UpdateStatusTx(ctx, request.ID, "COMPLETED"); err != nil {
				return err
			}
		} else {
			if err := s.stockRequestRepo.UpdateStatusTx(ctx, request.ID, "APPROVED"); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *stockRequestServiceImpl) RejectStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	request, err := s.stockRequestRepo.FindByID(ctx, id)
	if err != nil {
		return errors.New("Permintaan stok tidak ditemukan.")
	}

	if request.Status != "PENDING" {
		return errors.New("Hanya permintaan berstatus PENDING yang dapat ditolak.")
	}

	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		return s.stockRequestRepo.UpdateStatusTx(ctx, request.ID, "REJECTED")
	})
}

func (s *stockRequestServiceImpl) DispatchStockRequest(ctx context.Context, id int, userID int, roleID int) error {
	request, err := s.stockRequestRepo.FindByID(ctx, id)
	if err != nil {
		return errors.New("Permintaan stok tidak ditemukan.")
	}

	if request.Status != "APPROVED" {
		return errors.New("Hanya permintaan berstatus APPROVED yang dapat dikirim.")
	}
	if request.Type == "STOCK_OPNAME" {
		return errors.New("Permintaan Stock Opname tidak memerlukan pengiriman.")
	}

	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var movements []inventory_dto.BatchMovementRequest
		for _, item := range request.Items {
			notes := fmt.Sprintf("Pengiriman Permintaan Stok %s", request.RequestNumber)
			movements = append(movements, inventory_dto.BatchMovementRequest{
				SKU:            item.SKU,
				Quantity:       item.Quantity,
				FromLocationID: request.FromLocationID,
				Notes:          &notes,
			})
		}

		err = s.stockService.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
			Type:           "TRANSFER_OUT",
			FromLocationID: request.FromLocationID,
			Notes:          &request.RequestNumber,
			Movements:      movements,
		}, userID, 1)

		if err != nil {
			return err
		}

		return s.stockRequestRepo.UpdateStatusTx(ctx, request.ID, "SHIPPED")
	})
}

func (s *stockRequestServiceImpl) CompleteStockRequest(ctx context.Context, id int, req inventory_dto.CompleteStockRequest, userID int, roleID int) error {
	request, err := s.stockRequestRepo.FindByID(ctx, id)
	if err != nil {
		return errors.New("Permintaan stok tidak ditemukan.")
	}

	if request.Status != "SHIPPED" {
		return errors.New("Hanya permintaan berstatus SHIPPED yang dapat diselesaikan.")
	}

	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var movements []inventory_dto.BatchMovementRequest
		for _, item := range request.Items {
			rQty := item.Quantity
			for _, rItem := range req.ReceivedItems {
				if rItem.ProductID == item.ProductID {
					rQty = rItem.ReceivedQuantity
					break
				}
			}

			if err := s.stockRequestRepo.UpdateItemReceivedQtyTx(ctx, item.ID, rQty); err != nil {
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
			err = s.stockService.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
				Type:         "TRANSFER_IN",
				ToLocationID: request.ToLocationID,
				Notes:        &request.RequestNumber,
				Movements:    movements,
			}, userID, 1)

			if err != nil {
				return err
			}
		}

		return s.stockRequestRepo.UpdateStatusTx(ctx, request.ID, "COMPLETED")
	})
}

func (s *stockRequestServiceImpl) BulkActionStockRequest(ctx context.Context, req inventory_dto.BulkActionStockRequest, userID int, roleID int) (map[string]interface{}, error) {
	successCount := 0
	failedCount := 0
	details := []map[string]interface{}{}

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
			details = append(details, map[string]interface{}{"id": id, "status": "success"})
		} else {
			failedCount++
			details = append(details, map[string]interface{}{"id": id, "status": "failed", "reason": err.Error()})
		}
	}

	return map[string]interface{}{
		"successCount": successCount,
		"failedCount":  failedCount,
		"details":      details,
	}, nil
}
