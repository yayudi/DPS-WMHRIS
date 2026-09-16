package service

import (
	"context"
	"errors"
	"regexp"

	hris_repo "github.com/dps-wmhris/backend/internal/modules/hris/repository"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/modules/hris/model"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type ShiftService interface {
	GetAll(ctx context.Context) ([]model.Shift, error)
	GetByID(ctx context.Context, id int) (*model.Shift, error)
	Create(ctx context.Context, req dto.CreateShiftRequest) (int, error)
	Update(ctx context.Context, id int, req dto.UpdateShiftRequest) error
	Delete(ctx context.Context, id int) error
}

type shiftServiceImpl struct {
	db        *sqlx.DB
	shiftRepo hris_repo.ShiftRepository
}

func NewShiftService(db *sqlx.DB, shiftRepo hris_repo.ShiftRepository) ShiftService {
	return &shiftServiceImpl{db: db, shiftRepo: shiftRepo}
}

func (s *shiftServiceImpl) GetAll(ctx context.Context) ([]model.Shift, error) {
	return s.shiftRepo.GetAll(ctx)
}

func (s *shiftServiceImpl) GetByID(ctx context.Context, id int) (*model.Shift, error) {
	return s.shiftRepo.GetByID(ctx, id)
}

func (s *shiftServiceImpl) Create(ctx context.Context, req dto.CreateShiftRequest) (int, error) {
	if err := s.validateWorkDays(req.WorkDays); err != nil {
		return 0, err
	}

	shift := &model.Shift{
		Name:            req.Name,
		StartTime:       req.StartTime,
		EndTime:         req.EndTime,
		WorkDays:        req.WorkDays,
		FlexibleMinutes: req.FlexibleMinutes,
		IsDefault:       req.IsDefault,
	}

	var insertedID int
	err := database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		if shift.IsDefault {
			if err := s.shiftRepo.ClearDefault(ctx, tx); err != nil {
				return err
			}
		}

		// Ensure we use the tx for creation as well if we wanted it fully atomic,
		// but ShiftRepo.Create currently uses db.ExecContext (it doesn't accept ext).
		// Wait, we need ShiftRepo to support ext for Create.
		// Since we didn't add ext to Create, let's just do it directly on db.
		// Wait! Let's follow DRY and strict transaction rules.
		// Actually for now I'll just use the regular Create which might be outside the Tx,
		// or I can modify the repo later. Since this is a simple HRIS shift, partial failure is rare.
		id, err := s.shiftRepo.Create(ctx, tx, shift)
		if err != nil {
			return err
		}
		insertedID = id
		return nil
	})

	return insertedID, err
}

func (s *shiftServiceImpl) Update(ctx context.Context, id int, req dto.UpdateShiftRequest) error {
	if err := s.validateWorkDays(req.WorkDays); err != nil {
		return err
	}

	existing, err := s.shiftRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	existing.Name = req.Name
	existing.StartTime = req.StartTime
	existing.EndTime = req.EndTime
	existing.WorkDays = req.WorkDays
	existing.FlexibleMinutes = req.FlexibleMinutes
	existing.IsDefault = req.IsDefault

	return database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		if existing.IsDefault {
			if err := s.shiftRepo.ClearDefault(ctx, tx); err != nil {
				return err
			}
		}
		return s.shiftRepo.Update(ctx, tx, existing)
	})
}

func (s *shiftServiceImpl) Delete(ctx context.Context, id int) error {
	_, err := s.shiftRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	return s.shiftRepo.Delete(ctx, nil, id)
}

func (s *shiftServiceImpl) validateWorkDays(workDays string) error {
	// e.g. "1,2,3,4,5"
	matched, _ := regexp.MatchString(`^[1-7](,[1-7])*$`, workDays)
	if !matched {
		return errors.New("format work_days tidak valid, gunakan angka 1-7 dipisah koma (contoh: 1,2,3,4,5)")
	}
	return nil
}
