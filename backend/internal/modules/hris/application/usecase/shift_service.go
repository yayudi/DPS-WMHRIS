package usecase

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

type shiftUseCaseImpl struct {
	txManager database.TransactionManager
	shiftRepo hris_port.ShiftRepository
}

// NewShiftUseCase creates a ShiftUseCase wired with transaction management and shift persistence.
func NewShiftUseCase(txManager database.TransactionManager, shiftRepo hris_port.ShiftRepository) hris_port.ShiftUseCase {
	return &shiftUseCaseImpl{txManager: txManager, shiftRepo: shiftRepo}
}

func (s *shiftUseCaseImpl) GetAll(ctx context.Context) ([]domain.Shift, error) {
	shifts, err := s.shiftRepo.GetAll(ctx)
	if err != nil {
		return nil, err
	}
	if shifts == nil {
		return []domain.Shift{}, nil
	}
	return shifts, nil
}

func (s *shiftUseCaseImpl) GetByID(ctx context.Context, id int) (*domain.Shift, error) {
	shift, err := s.shiftRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrShiftNotFound
		}
		return nil, err
	}
	if shift == nil {
		return nil, domain.ErrShiftNotFound
	}
	return shift, nil
}

func (s *shiftUseCaseImpl) Create(ctx context.Context, req hris_dto.CreateShiftRequest) (int, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return 0, apperror.Validation("hris.shift.err_invalid_name", "nama shift wajib diisi")
	}
	if err := domain.ValidateWorkDays(req.WorkDays); err != nil {
		return 0, err
	}
	startTime, err := domain.NormalizeShiftTime(req.StartTime)
	if err != nil {
		return 0, err
	}
	endTime, err := domain.NormalizeShiftTime(req.EndTime)
	if err != nil {
		return 0, err
	}

	shift := &domain.Shift{
		Name:            name,
		StartTime:       startTime,
		EndTime:         endTime,
		WorkDays:        strings.TrimSpace(req.WorkDays),
		FlexibleMinutes: req.FlexibleMinutes,
		IsDefault:       req.IsDefault,
	}

	var insertedID int
	err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if shift.IsDefault {
			if err := s.shiftRepo.ClearDefault(txCtx); err != nil {
				return err
			}
		}

		id, err := s.shiftRepo.Create(txCtx, shift)
		if err != nil {
			return err
		}
		insertedID = id
		return nil
	})

	return insertedID, err
}

func (s *shiftUseCaseImpl) Update(ctx context.Context, id int, req hris_dto.UpdateShiftRequest) error {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return apperror.Validation("hris.shift.err_invalid_name", "nama shift wajib diisi")
	}
	if err := domain.ValidateWorkDays(req.WorkDays); err != nil {
		return err
	}
	startTime, err := domain.NormalizeShiftTime(req.StartTime)
	if err != nil {
		return err
	}
	endTime, err := domain.NormalizeShiftTime(req.EndTime)
	if err != nil {
		return err
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		existing, err := s.shiftRepo.GetByID(txCtx, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrShiftNotFound
			}
			return err
		}
		if existing == nil {
			return domain.ErrShiftNotFound
		}

		existing.Name = name
		existing.StartTime = startTime
		existing.EndTime = endTime
		existing.WorkDays = strings.TrimSpace(req.WorkDays)
		existing.FlexibleMinutes = req.FlexibleMinutes
		existing.IsDefault = req.IsDefault

		if existing.IsDefault {
			if err := s.shiftRepo.ClearDefault(txCtx); err != nil {
				return err
			}
		}
		return s.shiftRepo.Update(txCtx, existing)
	})
}

func (s *shiftUseCaseImpl) Delete(ctx context.Context, id int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		existing, err := s.shiftRepo.GetByID(txCtx, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrShiftNotFound
			}
			return err
		}
		if existing == nil {
			return domain.ErrShiftNotFound
		}
		if existing.IsDefault {
			return domain.ErrCannotDeleteDefaultShift
		}
		return s.shiftRepo.Delete(txCtx, id)
	})
}
