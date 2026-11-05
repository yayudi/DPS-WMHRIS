package usecase

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type slotServiceImpl struct {
	txManager   database.TransactionManager
	slotRepo    inventory_port.SlotRepository
	trxRepo     inventory_port.StockTransactionRepository
	locRepo     inventory_port.LocationRepository
	productRepo catalog_port.ProductRepository
}

// NewSlotUseCase creates a new instance of SlotUseCase.
func NewSlotUseCase(
	txManager database.TransactionManager,
	slotRepo inventory_port.SlotRepository,
	trxRepo inventory_port.StockTransactionRepository,
	locRepo inventory_port.LocationRepository,
	productRepo catalog_port.ProductRepository,
) inventory_port.SlotUseCase {
	return &slotServiceImpl{
		txManager:   txManager,
		slotRepo:    slotRepo,
		trxRepo:     trxRepo,
		locRepo:     locRepo,
		productRepo: productRepo,
	}
}

// AddSlot adds a new slotting coordinate to the product at the location.
func (s *slotServiceImpl) AddSlot(ctx context.Context, userID int, req inventory_dto.UpsertSlotRequest) (*inventory_dto.SlotResponse, error) {
	if strings.TrimSpace(req.Room) == "" {
		return nil, domain.ErrSlotRoomRequired
	}
	if strings.TrimSpace(req.Rack) == "" {
		return nil, domain.ErrSlotRackRequired
	}

	var result *inventory_dto.SlotResponse
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		existingSlots, err := s.slotRepo.GetSlots(ctx, req.ProductID, req.LocationID)
		if err != nil {
			return err
		}

		newFormatted := domain.FormatCoordinate(req.Room, req.Rack, req.Tier)

		for _, es := range existingSlots {
			if es.FormattedCoordinate == newFormatted {
				result = &inventory_dto.SlotResponse{
					ID:                  es.ID,
					ProductID:           es.ProductID,
					LocationID:          es.LocationID,
					Room:                es.Room,
					Rack:                es.Rack,
					Tier:                es.Tier,
					FormattedCoordinate: es.FormattedCoordinate,
					IsPrimary:           es.IsPrimary,
					UpdatedAt:           es.UpdatedAt,
				}
				return nil
			}
		}

		isPrimary := req.IsPrimary
		action := domain.SlotActionAdded
		if len(existingSlots) == 0 {
			isPrimary = true
			action = domain.SlotActionInitialAssign
		} else if isPrimary {
			_ = s.slotRepo.SetPrimarySlot(ctx, req.ProductID, req.LocationID, 0)
		}

		slot := &domain.ProductLocationSlot{
			ProductID:           req.ProductID,
			LocationID:          req.LocationID,
			Room:                strings.TrimSpace(req.Room),
			Rack:                strings.TrimSpace(req.Rack),
			Tier:                req.Tier,
			FormattedCoordinate: newFormatted,
			IsPrimary:           isPrimary,
			UpdatedBy:           &userID,
		}

		if err := s.slotRepo.CreateSlot(ctx, slot); err != nil {
			return err
		}

		logEntry := &domain.ProductLocationSlotLog{
			ProductID:    req.ProductID,
			LocationID:   req.LocationID,
			Action:       action,
			ToCoordinate: &newFormatted,
			Notes:        req.Notes,
			UserID:       &userID,
		}
		if err := s.slotRepo.CreateSlotLog(ctx, logEntry); err != nil {
			return err
		}

		result = &inventory_dto.SlotResponse{
			ID:                  slot.ID,
			ProductID:           slot.ProductID,
			LocationID:          slot.LocationID,
			Room:                slot.Room,
			Rack:                slot.Rack,
			Tier:                slot.Tier,
			FormattedCoordinate: slot.FormattedCoordinate,
			IsPrimary:           slot.IsPrimary,
			UpdatedAt:           time.Now(),
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// DeleteSlot removes a slot coordinate and records a REMOVED log.
func (s *slotServiceImpl) DeleteSlot(ctx context.Context, userID int, slotID int, notes *string) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		slot, err := s.slotRepo.GetSlotByID(ctx, slotID)
		if err != nil {
			return err
		}
		if slot == nil {
			return domain.ErrSlotNotFound
		}

		if err := s.slotRepo.DeleteSlot(ctx, slotID); err != nil {
			return err
		}

		logEntry := &domain.ProductLocationSlotLog{
			ProductID:      slot.ProductID,
			LocationID:     slot.LocationID,
			Action:         domain.SlotActionRemoved,
			FromCoordinate: &slot.FormattedCoordinate,
			Notes:          notes,
			UserID:         &userID,
		}
		if err := s.slotRepo.CreateSlotLog(ctx, logEntry); err != nil {
			return err
		}

		if slot.IsPrimary {
			remaining, err := s.slotRepo.GetSlots(ctx, slot.ProductID, slot.LocationID)
			if err == nil && len(remaining) > 0 {
				_ = s.slotRepo.SetPrimarySlot(ctx, slot.ProductID, slot.LocationID, remaining[0].ID)
			}
		}

		return nil
	})
}

// SetPrimarySlot sets a specific slot coordinate as the primary picking slot.
func (s *slotServiceImpl) SetPrimarySlot(ctx context.Context, userID int, productID int, locationID int, slotID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		slot, err := s.slotRepo.GetSlotByID(ctx, slotID)
		if err != nil {
			return err
		}
		if slot == nil || slot.ProductID != productID || slot.LocationID != locationID {
			return domain.ErrSlotNotFound
		}

		if err := s.slotRepo.SetPrimarySlot(ctx, productID, locationID, slotID); err != nil {
			return err
		}

		note := fmt.Sprintf("Koordinat %s ditetapkan sebagai rak utama", slot.FormattedCoordinate)
		logEntry := &domain.ProductLocationSlotLog{
			ProductID:    productID,
			LocationID:   locationID,
			Action:       domain.SlotActionMoved,
			ToCoordinate: &slot.FormattedCoordinate,
			Notes:        &note,
			UserID:       &userID,
		}
		return s.slotRepo.CreateSlotLog(ctx, logEntry)
	})
}

// GetSlots retrieves all active slotting coordinates for a product at a specific location.
func (s *slotServiceImpl) GetSlots(ctx context.Context, productID int, locationID int) ([]inventory_dto.SlotResponse, error) {
	slots, err := s.slotRepo.GetSlots(ctx, productID, locationID)
	if err != nil {
		return nil, err
	}

	res := make([]inventory_dto.SlotResponse, len(slots))
	for i, sl := range slots {
		res[i] = inventory_dto.SlotResponse{
			ID:                  sl.ID,
			ProductID:           sl.ProductID,
			LocationID:          sl.LocationID,
			Room:                sl.Room,
			Rack:                sl.Rack,
			Tier:                sl.Tier,
			FormattedCoordinate: sl.FormattedCoordinate,
			IsPrimary:           sl.IsPrimary,
			UpdatedAt:           sl.UpdatedAt,
		}
	}
	return res, nil
}


// GetSlotLogs retrieves paginated audit trail logs for slotting movements.
func (s *slotServiceImpl) GetSlotLogs(ctx context.Context, productID int, locationID int, page int, limit int) (utils.PaginatedResult[domain.ProductLocationSlotLog], error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit

	logs, total, err := s.slotRepo.GetSlotLogs(ctx, productID, locationID, limit, offset)
	if err != nil {
		return utils.PaginatedResult[domain.ProductLocationSlotLog]{}, err
	}

	totalPages := 0
	if limit > 0 && total > 0 {
		totalPages = (total + limit - 1) / limit
	}

	return utils.PaginatedResult[domain.ProductLocationSlotLog]{
		Data:       logs,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

// GetPickingLocationsForKelja resolves detailed physical locations and ambalan coordinates for an order reference.
func (s *slotServiceImpl) GetPickingLocationsForKelja(ctx context.Context, referenceID string) (*inventory_dto.KeljaPickingLocationsResponse, error) {
	if referenceID == "" {
		return nil, errors.New("reference_id is required")
	}

	trx, err := s.trxRepo.GetByReference(ctx, "KELJA_FULFILLMENT", referenceID)
	if err != nil {
		return nil, err
	}
	if trx == nil {
		return nil, fmt.Errorf("fulfillment with reference %s not found", referenceID)
	}

	fullTrx, err := s.trxRepo.GetByID(ctx, trx.ID)
	if err != nil {
		return nil, err
	}
	if fullTrx == nil {
		return nil, fmt.Errorf("fulfillment transaction %d not found", trx.ID)
	}

	resp := &inventory_dto.KeljaPickingLocationsResponse{
		ReferenceID:   fullTrx.ReferenceID,
		TransactionNo: fullTrx.TransactionNo,
		Status:        fullTrx.Status,
		Items:         make([]inventory_dto.KeljaItemPickingLocation, 0, len(fullTrx.Movements)),
	}

	for _, mov := range fullTrx.Movements {
		sku := ""
		productName := ""
		if s.productRepo != nil {
			if prod, err := s.productRepo.FindByID(ctx, int(mov.ProductID)); err == nil && prod != nil {
				sku = prod.SKU
				productName = prod.Name
			}
		}

		availableLocs, err := s.locRepo.FindAvailableStockLocations(ctx, int(mov.ProductID), "DISPLAY", fullTrx.AssignedBuilding)
		if err != nil || len(availableLocs) == 0 {
			availableLocs, _ = s.locRepo.FindFulfillmentSourceStock(ctx, int(mov.ProductID))
		}

		if len(availableLocs) > 0 {
			topLoc := availableLocs[0]
			loc, err := s.locRepo.FindByID(ctx, topLoc.LocationID)
			if err == nil && loc != nil {
				slots, _ := s.slotRepo.GetSlots(ctx, int(mov.ProductID), loc.ID)

				itemLoc := inventory_dto.KeljaItemPickingLocation{
					ProductID:         int(mov.ProductID),
					SKU:               sku,
					ProductName:       productName,
					QuantityAllocated: mov.TargetQuantity,
					Location: inventory_dto.KeljaLocationSummary{
						ID:       loc.ID,
						Code:     loc.Code,
						Building: loc.Building,
						Floor:    loc.Floor,
					},
					Slotting: inventory_dto.KeljaSlottingSummary{
						IsSlotted: false,
					},
				}

				if len(slots) > 0 {
					// Deterministic ordering: primary slot first, then tie-break by ID / FormattedCoordinate
					sort.SliceStable(slots, func(i, j int) bool {
						if slots[i].IsPrimary != slots[j].IsPrimary {
							return slots[i].IsPrimary
						}
						if slots[i].ID != slots[j].ID {
							return slots[i].ID < slots[j].ID
						}
						return slots[i].FormattedCoordinate < slots[j].FormattedCoordinate
					})

					primarySlot := slots[0]
					itemLoc.Slotting.IsSlotted = true
					itemLoc.Slotting.Room = &primarySlot.Room
					itemLoc.Slotting.Rack = &primarySlot.Rack
					itemLoc.Slotting.Tier = primarySlot.Tier
					itemLoc.Slotting.FormattedCoordinate = &primarySlot.FormattedCoordinate

					allCoords := make([]string, len(slots))
					for idx, sl := range slots {
						allCoords[idx] = sl.FormattedCoordinate
					}
					itemLoc.Slotting.AllCoordinates = allCoords
				}

				resp.Items = append(resp.Items, itemLoc)
				continue
			}
		}

		resp.Items = append(resp.Items, inventory_dto.KeljaItemPickingLocation{
			ProductID:         int(mov.ProductID),
			SKU:               sku,
			ProductName:       productName,
			QuantityAllocated: mov.TargetQuantity,
			Location: inventory_dto.KeljaLocationSummary{
				Code: fullTrx.AssignedBuilding,
			},
			Slotting: inventory_dto.KeljaSlottingSummary{
				IsSlotted: false,
			},
		})
	}

	return resp, nil
}
