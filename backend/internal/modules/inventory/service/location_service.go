package service

import (
	"context"
	"strconv"

	global_model "github.com/dps-wmhris/backend/internal/model"

	inventory_model "github.com/dps-wmhris/backend/internal/modules/inventory/model"
	inventory_repo "github.com/dps-wmhris/backend/internal/modules/inventory/repository"
	global_repo "github.com/dps-wmhris/backend/internal/repository"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type LocationService interface {
	CreateLocation(ctx context.Context, userID int, req dto.CreateLocationRequest) (*inventory_model.Location, error)
	GetAllLocations(ctx context.Context) ([]inventory_model.Location, error)
	UpdateLocation(ctx context.Context, userID int, locationID int, req dto.UpdateLocationRequest) error
	DeleteLocation(ctx context.Context, userID int, locationID int) error
	GetStockSample(ctx context.Context, locationID int) ([]dto.StockSampleResponse, error)
}

type locationServiceImpl struct {
	db           *sqlx.DB
	locationRepo inventory_repo.LocationRepository
	logRepo      global_repo.SystemLogRepository
}

func NewLocationService(db *sqlx.DB, locationRepo inventory_repo.LocationRepository, logRepo global_repo.SystemLogRepository) LocationService {
	return &locationServiceImpl{
		db:           db,
		locationRepo: locationRepo,
		logRepo:      logRepo,
	}
}

func (s *locationServiceImpl) CreateLocation(ctx context.Context, userID int, req dto.CreateLocationRequest) (*inventory_model.Location, error) {
	location := &inventory_model.Location{
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
	log := &global_model.SystemLog{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "LOCATION",
		TargetID:   strconv.Itoa(location.ID),
		Changes:    &changes,
	}
	_ = s.logRepo.Create(ctx, s.db, log)

	return location, nil
}

func (s *locationServiceImpl) UpdateLocation(ctx context.Context, userID int, locationID int, req dto.UpdateLocationRequest) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		location := &inventory_model.Location{
			ID:       locationID,
			Code:     req.Code,
			Building: req.Building,
			Floor:    req.Floor,
			Name:     req.Name,
			Purpose:  req.Purpose,
			IsActive: *req.IsActive,
		}

		if err := s.locationRepo.Update(ctx, tx, location); err != nil {
			return err
		}

		changes := `{"note": "Updated Location"}`
		log := &global_model.SystemLog{
			UserID:     userID,
			Action:     "UPDATE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(locationID),
			Changes:    &changes,
		}
		return s.logRepo.Create(ctx, tx, log)
	})
}

func (s *locationServiceImpl) DeleteLocation(ctx context.Context, userID int, locationID int) error {
	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		if err := s.locationRepo.SoftDelete(ctx, tx, locationID); err != nil {
			return err
		}

		changes := `{"note": "Deleted Location"}`
		log := &global_model.SystemLog{
			UserID:     userID,
			Action:     "DELETE",
			TargetType: "LOCATION",
			TargetID:   strconv.Itoa(locationID),
			Changes:    &changes,
		}
		return s.logRepo.Create(ctx, tx, log)
	})
}

func (s *locationServiceImpl) GetAllLocations(ctx context.Context) ([]inventory_model.Location, error) {
	return s.locationRepo.FindAll(ctx)
}

func (s *locationServiceImpl) GetStockSample(ctx context.Context, locationID int) ([]dto.StockSampleResponse, error) {
	return s.locationRepo.GetStockSample(ctx, locationID)
}
