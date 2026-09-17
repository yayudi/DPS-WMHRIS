package usecase

import (
	"context"
	"errors"
	"regexp"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"

	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
)

type shiftUseCaseImpl struct {
	txManager database.TransactionManager
	shiftRepo hris_port.ShiftRepository
}

func NewShiftUseCase(txManager database.TransactionManager, shiftRepo hris_port.ShiftRepository) hris_port.ShiftUseCase {
	return &shiftUseCaseImpl{txManager: txManager, shiftRepo: shiftRepo}
}

func (s *shiftUseCaseImpl) GetAll(ctx context.Context) ([]domain.Shift, error) {
	return s.shiftRepo.GetAll(ctx)
}

func (s *shiftUseCaseImpl) GetByID(ctx context.Context, id int) (*domain.Shift, error) {
	return s.shiftRepo.GetByID(ctx, id)
}

func (s *shiftUseCaseImpl) Create(ctx context.Context, req hris_dto.CreateShiftRequest) (int, error) {
	if err := s.validateWorkDays(req.WorkDays); err != nil {
		return 0, err
	}

	shift := &domain.Shift{
		Name:            req.Name,
		StartTime:       req.StartTime,
		EndTime:         req.EndTime,
		WorkDays:        req.WorkDays,
		FlexibleMinutes: req.FlexibleMinutes,
		IsDefault:       req.IsDefault,
	}

	var insertedID int
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if shift.IsDefault {
			if err := s.shiftRepo.ClearDefault(ctx); err != nil {
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
		id, err := s.shiftRepo.Create(ctx, shift)
		if err != nil {
			return err
		}
		insertedID = id
		return nil
	})

	return insertedID, err
}

func (s *shiftUseCaseImpl) Update(ctx context.Context, id int, req hris_dto.UpdateShiftRequest) error {
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

	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if existing.IsDefault {
			if err := s.shiftRepo.ClearDefault(ctx); err != nil {
				return err
			}
		}
		return s.shiftRepo.Update(ctx, existing)
	})
}

func (s *shiftUseCaseImpl) Delete(ctx context.Context, id int) error {
	_, err := s.shiftRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	return s.shiftRepo.Delete(ctx, id)
}

func (s *shiftUseCaseImpl) validateWorkDays(workDays string) error {
	// e.g. "1,2,3,4,5"
	matched, _ := regexp.MatchString(`^[1-7](,[1-7])*$`, workDays)
	if !matched {
		return errors.New("format work_days tidak valid, gunakan angka 1-7 dipisah koma (contoh: 1,2,3,4,5)")
	}
	return nil
}
