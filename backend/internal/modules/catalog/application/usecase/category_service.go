// Package usecase implements business use cases for product categories, products, packages, and bulk catalog updates.
package usecase

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

type categoryServiceImpl struct {
	txManager    database.TransactionManager
	categoryRepo catalog_port.CategoryRepository
}

// NewCategoryUseCase creates a CategoryUseCase wired with transaction management and category persistence.
func NewCategoryUseCase(txManager database.TransactionManager, categoryRepo catalog_port.CategoryRepository) catalog_port.CategoryUseCase {
	return &categoryServiceImpl{
		txManager:    txManager,
		categoryRepo: categoryRepo,
	}
}

func (s *categoryServiceImpl) CreateCategory(ctx context.Context, req catalog_dto.CreateCategoryRequest) (*domain.Category, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, domain.ErrInvalidCategoryName
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	category := &domain.Category{
		Name:     name,
		IsActive: isActive,
	}

	err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.categoryRepo.Create(txCtx, category); err != nil {
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateCategoryName
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return category, nil
}

func (s *categoryServiceImpl) GetActiveCategories(ctx context.Context) ([]domain.Category, error) {
	categories, err := s.categoryRepo.FindAllActive(ctx)
	if err != nil {
		return nil, err
	}
	if categories == nil {
		return []domain.Category{}, nil
	}
	return categories, nil
}

func (s *categoryServiceImpl) GetCategories(ctx context.Context, status string) ([]domain.Category, error) {
	normalizedStatus, err := domain.NormalizeCategoryStatus(status)
	if err != nil {
		return nil, err
	}
	categories, err := s.categoryRepo.FindByStatus(ctx, normalizedStatus)
	if err != nil {
		return nil, err
	}
	if categories == nil {
		return []domain.Category{}, nil
	}
	return categories, nil
}

func (s *categoryServiceImpl) UpdateCategory(ctx context.Context, id int, req catalog_dto.UpdateCategoryRequest) error {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return domain.ErrInvalidCategoryName
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.categoryRepo.Update(txCtx, id, name); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrCategoryNotFound
			}
			if database.IsDuplicateKey(err) {
				return domain.ErrDuplicateCategoryName
			}
			return err
		}
		return nil
	})
}

func (s *categoryServiceImpl) DeleteCategory(ctx context.Context, id int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.categoryRepo.Delete(txCtx, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrCategoryNotFound
			}
			return err
		}
		return nil
	})
}

func (s *categoryServiceImpl) RestoreCategory(ctx context.Context, id int) error {
	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := s.categoryRepo.Restore(txCtx, id); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return domain.ErrCategoryNotFound
			}
			return err
		}
		return nil
	})
}
