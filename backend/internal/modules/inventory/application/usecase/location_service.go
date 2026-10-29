package usecase

import (
	"context"
	"errors"
	"strconv"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type locationServiceImpl struct {
	txManager    database.TransactionManager
	locationRepo inventory_port.LocationRepository
	eventBus     eventbus.EventBus
}

func NewLocationUseCase(txManager database.TransactionManager, locationRepo inventory_port.LocationRepository, eventBus eventbus.EventBus) inventory_port.LocationUseCase {
	return &locationServiceImpl{
		txManager:    txManager,
		locationRepo: locationRepo,
		eventBus:     eventBus,
	}
}

func (s *locationServiceImpl) CreateLocation(ctx context.Context, userID int, req inventory_dto.CreateLocationRequest) (*domain.Location, error) {
	isFulfillment := false
	if req.IsFulfillmentSource != nil {
		isFulfillment = *req.IsFulfillmentSource
	} else if req.Purpose == "DISPLAY" {
		isFulfillment = true
	}

	location := &domain.Location{
		Code:                req.Code,
		Building:            req.Building,
		Floor:               req.Floor,
		Name:                req.Name,
		Purpose:             req.Purpose,
		IsActive:            *req.IsActive,
		IsFulfillmentSource: isFulfillment,
	}

	err := s.locationRepo.Create(ctx, location)
	if err != nil {
		return nil, err
	}

	// Logging
	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(location.ID),
		Changes:    `{"code": "` + req.Code + `", "name": "` + req.Name + `"}`,
	})

	return location, nil
}

func (s *locationServiceImpl) UpdateLocation(ctx context.Context, userID int, locationID int, req inventory_dto.UpdateLocationRequest) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		existing, err := s.locationRepo.FindByID(ctx, locationID)
		if err != nil {
			return err
		}

		isFulfillment := false
		if existing != nil {
			isFulfillment = existing.IsFulfillmentSource
		}
		if req.IsFulfillmentSource != nil {
			isFulfillment = *req.IsFulfillmentSource
		}

		location := &domain.Location{
			ID:                  locationID,
			Code:                req.Code,
			Building:            req.Building,
			Floor:               req.Floor,
			Name:                req.Name,
			Purpose:             req.Purpose,
			IsActive:            *req.IsActive,
			IsFulfillmentSource: isFulfillment,
		}

		if err := s.locationRepo.Update(ctx, location); err != nil {
			return err
		}

		_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
			UserID:     userID,
			Action:     "UPDATE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(locationID),
			Changes:    `{"note": "Updated Location"}`,
		})
		return nil
	})
}

func (s *locationServiceImpl) ToggleFulfillmentSource(ctx context.Context, userID int, locationID int, isFulfillmentSource bool) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		loc, err := s.locationRepo.FindByID(ctx, locationID)
		if err != nil {
			return err
		}
		if loc == nil {
			return errors.New("location not found")
		}
		if isFulfillmentSource && (loc.Purpose == "BAD_STOCK" || loc.Purpose == "WORKSHOP" || loc.Purpose == "BRANCH") {
			return errors.New("lokasi dengan purpose " + loc.Purpose + " tidak dapat dijadikan sumber fulfillment")
		}

		if err := s.locationRepo.UpdateFulfillmentSourceFlag(ctx, locationID, isFulfillmentSource); err != nil {
			return err
		}

		_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
			UserID:     userID,
			Action:     "UPDATE_FULFILLMENT_SOURCE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(locationID),
			Changes:    `{"is_fulfillment_source": ` + strconv.FormatBool(isFulfillmentSource) + `}`,
		})
		return nil
	})
}

func (s *locationServiceImpl) DeleteLocation(ctx context.Context, userID int, locationID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if err := s.locationRepo.SoftDelete(ctx, locationID); err != nil {
			return err
		}

		_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
			UserID:     userID,
			Action:     "DELETE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(locationID),
			Changes:    `{"note": "Deleted Location"}`,
		})
		return nil
	})
}

func (s *locationServiceImpl) GetAllLocations(ctx context.Context) ([]domain.Location, error) {
	return s.locationRepo.FindAll(ctx)
}

func (s *locationServiceImpl) GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error) {
	return s.locationRepo.GetStockSample(ctx, locationID)
}
