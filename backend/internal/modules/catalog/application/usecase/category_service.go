package usecase

import (
	"context"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"

	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
)

type categoryServiceImpl struct {
	categoryRepo catalog_port.CategoryRepository
}

func NewCategoryUseCase(categoryRepo catalog_port.CategoryRepository) catalog_port.CategoryUseCase {
	return &categoryServiceImpl{categoryRepo: categoryRepo}
}

func (s *categoryServiceImpl) CreateCategory(ctx context.Context, req catalog_dto.CreateCategoryRequest) (*domain.Category, error) {
	category := &domain.Category{
		Name:     req.Name,
		IsActive: *req.IsActive,
	}

	err := s.categoryRepo.Create(ctx, category)
	if err != nil {
		return nil, err
	}

	return category, nil
}

func (s *categoryServiceImpl) GetActiveCategories(ctx context.Context) ([]domain.Category, error) {
	return s.categoryRepo.FindAllActive(ctx)
}

func (s *categoryServiceImpl) UpdateCategory(ctx context.Context, id int, req catalog_dto.UpdateCategoryRequest) error {
	return s.categoryRepo.Update(ctx, id, req.Name)
}

func (s *categoryServiceImpl) DeleteCategory(ctx context.Context, id int) error {
	return s.categoryRepo.Delete(ctx, id)
}
