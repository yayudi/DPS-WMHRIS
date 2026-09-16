package service

import (
	"context"

	catalog_model "github.com/dps-wmhris/backend/internal/modules/catalog/model"
	catalog_repo "github.com/dps-wmhris/backend/internal/modules/catalog/repository"

	"github.com/dps-wmhris/backend/internal/dto"
)

type CategoryService interface {
	CreateCategory(ctx context.Context, req dto.CreateCategoryRequest) (*catalog_model.Category, error)
	GetActiveCategories(ctx context.Context) ([]catalog_model.Category, error)
	UpdateCategory(ctx context.Context, id int, req dto.UpdateCategoryRequest) error
	DeleteCategory(ctx context.Context, id int) error
}

type categoryServiceImpl struct {
	categoryRepo catalog_repo.CategoryRepository
}

func NewCategoryService(categoryRepo catalog_repo.CategoryRepository) CategoryService {
	return &categoryServiceImpl{categoryRepo: categoryRepo}
}

func (s *categoryServiceImpl) CreateCategory(ctx context.Context, req dto.CreateCategoryRequest) (*catalog_model.Category, error) {
	category := &catalog_model.Category{
		Name:     req.Name,
		IsActive: *req.IsActive,
	}

	err := s.categoryRepo.Create(ctx, category)
	if err != nil {
		return nil, err
	}

	return category, nil
}

func (s *categoryServiceImpl) GetActiveCategories(ctx context.Context) ([]catalog_model.Category, error) {
	return s.categoryRepo.FindAllActive(ctx)
}

func (s *categoryServiceImpl) UpdateCategory(ctx context.Context, id int, req dto.UpdateCategoryRequest) error {
	return s.categoryRepo.Update(ctx, id, req.Name)
}

func (s *categoryServiceImpl) DeleteCategory(ctx context.Context, id int) error {
	return s.categoryRepo.Delete(ctx, id)
}
