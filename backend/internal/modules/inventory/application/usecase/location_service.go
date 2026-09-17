package usecase

import (
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	"context"
	"strconv"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
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
	location := &domain.Location{
		Code:     req.Code,
		Building: req.Building,
		Floor:    req.Floor,
		Name:     req.Name,
		Purpose:  req.Purpose,
		IsActive: *req.IsActive,
	}

	err := s.locationRepo.Create(ctx, location)
	if err != nil {
		return nil, err
	}

	// Logging
	changes := `{"code": "` + req.Code + `", "name": "` + req.Name + `"}`
	_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "CREATE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(location.ID),
			Changes:    &changes,
		},
		userID,
	))

	return location, nil
}

func (s *locationServiceImpl) UpdateLocation(ctx context.Context, userID int, locationID int, req inventory_dto.UpdateLocationRequest) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		location := &domain.Location{
			ID:       locationID,
			Code:     req.Code,
			Building: req.Building,
			Floor:    req.Floor,
			Name:     req.Name,
			Purpose:  req.Purpose,
			IsActive: *req.IsActive,
		}

		if err := s.locationRepo.Update(ctx, location); err != nil {
			return err
		}

		changes := `{"note": "Updated Location"}`
		_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
			system_domain.EventSystemLog,
			system_domain.SystemLogPayload{
				Action:     "UPDATE",
				TargetType: "LOCATION",
				TargetID:   strconv.Itoa(locationID),
				Changes:    &changes,
			},
			userID,
		))
		return nil
	})
}

func (s *locationServiceImpl) DeleteLocation(ctx context.Context, userID int, locationID int) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if err := s.locationRepo.SoftDelete(ctx, locationID); err != nil {
			return err
		}

		changes := `{"note": "Deleted Location"}`
		_ = s.eventBus.Publish(ctx, eventbus.NewEvent(
			system_domain.EventSystemLog,
			system_domain.SystemLogPayload{
				Action:     "DELETE",
				TargetType: "LOCATION",
				TargetID:   strconv.Itoa(locationID),
				Changes:    &changes,
			},
			userID,
		))
		return nil
	})
}

func (s *locationServiceImpl) GetAllLocations(ctx context.Context) ([]domain.Location, error) {
	return s.locationRepo.FindAll(ctx)
}

func (s *locationServiceImpl) GetStockSample(ctx context.Context, locationID int) ([]inventory_dto.StockSampleResponse, error) {
	return s.locationRepo.GetStockSample(ctx, locationID)
}
