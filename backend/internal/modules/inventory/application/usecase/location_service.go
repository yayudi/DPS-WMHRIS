// Package usecase implements business use cases for the inventory bounded context.
package usecase

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type locationServiceImpl struct {
	txManager    database.TransactionManager
	locationRepo inventory_port.LocationRepository
	eventBus     eventbus.EventBus
}

// NewLocationUseCase creates a LocationUseCase wired with transaction management and event publishing.
func NewLocationUseCase(
	txManager database.TransactionManager,
	locationRepo inventory_port.LocationRepository,
	eventBus eventbus.EventBus,
) inventory_port.LocationUseCase {
	return &locationServiceImpl{
		txManager:    txManager,
		locationRepo: locationRepo,
		eventBus:     eventBus,
	}
}

func (s *locationServiceImpl) CreateLocation(ctx context.Context, userID int, req inventory_dto.CreateLocationRequest) (*domain.Location, error) {
	code := strings.TrimSpace(req.Code)
	building := strings.TrimSpace(req.Building)
	name := strings.TrimSpace(req.Name)
	purpose := strings.TrimSpace(req.Purpose)
	if code == "" || building == "" {
		return nil, domain.ErrInvalidLocationPayload
	}

	isFulfillment := false
	if req.IsFulfillmentSource != nil {
		isFulfillment = *req.IsFulfillmentSource
	} else if strings.EqualFold(purpose, domain.LocationPurposeDisplay) {
		isFulfillment = true
	}

	if err := domain.ValidateFulfillmentSourcePurpose(purpose, isFulfillment); err != nil {
		return nil, err
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	location := &domain.Location{
		Code:                code,
		Building:            building,
		Floor:               req.Floor,
		Name:                name,
		Purpose:             purpose,
		IsActive:            isActive,
		IsFulfillmentSource: isFulfillment,
	}

	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.locationRepo.Create(txCtx, location); err != nil {
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateLocationCode
			}
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(location.ID),
		Changes: map[string]any{
			"code":                  location.Code,
			"name":                  location.Name,
			"building":              location.Building,
			"purpose":               location.Purpose,
			"is_fulfillment_source": location.IsFulfillmentSource,
		},
	})

	return location, nil
}

func (s *locationServiceImpl) UpdateLocation(ctx context.Context, userID int, locationID int, req inventory_dto.UpdateLocationRequest) error {
	code := strings.TrimSpace(req.Code)
	building := strings.TrimSpace(req.Building)
	name := strings.TrimSpace(req.Name)
	purpose := strings.TrimSpace(req.Purpose)
	if code == "" || building == "" {
		return domain.ErrInvalidLocationPayload
	}

	var finalFulfillment bool
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		existing, err := s.locationRepo.FindByID(txCtx, locationID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		if existing == nil {
			return domain.ErrLocationNotFound
		}

		isFulfillment := existing.IsFulfillmentSource
		if req.IsFulfillmentSource != nil {
			isFulfillment = *req.IsFulfillmentSource
		}
		if err := domain.ValidateFulfillmentSourcePurpose(purpose, isFulfillment); err != nil {
			return err
		}
		finalFulfillment = isFulfillment

		isActive := existing.IsActive
		if req.IsActive != nil {
			isActive = *req.IsActive
		}

		location := &domain.Location{
			ImmutableEntity:     kernel.ImmutableEntity{ID: locationID},
			Code:                code,
			Building:            building,
			Floor:               req.Floor,
			Name:                name,
			Purpose:             purpose,
			IsActive:            isActive,
			IsFulfillmentSource: isFulfillment,
		}

		if err := s.locationRepo.Update(txCtx, location); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateLocationCode
			}
			return err
		}
		return nil
	}); err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(locationID),
		Changes: map[string]any{
			"code":                  code,
			"name":                  name,
			"building":              building,
			"purpose":               purpose,
			"is_fulfillment_source": finalFulfillment,
		},
	})
	return nil
}

func (s *locationServiceImpl) ToggleFulfillmentSource(ctx context.Context, userID int, locationID int, isFulfillmentSource bool) error {
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		loc, err := s.locationRepo.FindByID(txCtx, locationID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		if loc == nil {
			return domain.ErrLocationNotFound
		}
		if err := domain.ValidateFulfillmentSourcePurpose(loc.Purpose, isFulfillmentSource); err != nil {
			return err
		}

		if err := s.locationRepo.UpdateFulfillmentSourceFlag(txCtx, locationID, isFulfillmentSource); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		return nil
	}); err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE_FULFILLMENT_SOURCE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(locationID),
		Changes:    map[string]any{"is_fulfillment_source": isFulfillmentSource},
	})
	return nil
}

func (s *locationServiceImpl) DeleteLocation(ctx context.Context, userID int, locationID int) error {
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		existing, err := s.locationRepo.FindByID(txCtx, locationID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		if existing == nil {
			return domain.ErrLocationNotFound
		}

		if err := s.locationRepo.SoftDelete(txCtx, locationID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrLocationNotFound
			}
			return err
		}
		return nil
	}); err != nil {
		return err
	}

	_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(locationID),
		Changes:    map[string]any{"note": "Deleted Location"},
	})
	return nil
}

func (s *locationServiceImpl) GetAllLocations(ctx context.Context) ([]domain.Location, error) {
	locations, err := s.locationRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	if locations == nil {
		return []domain.Location{}, nil
	}
	return locations, nil
}

func (s *locationServiceImpl) GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error) {
	samples, err := s.locationRepo.GetStockSample(ctx, locationID)
	if err != nil {
		return nil, err
	}
	if samples == nil {
		return []inventory_dto.StockSampleResponse{}, nil
	}
	return samples, nil
}
