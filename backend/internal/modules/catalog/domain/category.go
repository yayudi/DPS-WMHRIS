package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

// Category represents a product category row in the categories table.
type Category struct {
	kernel.BaseEntity
	Name         string `db:"name" json:"name"`
	IsActive     bool   `db:"is_active" json:"is_active"`
	ProductCount int    `db:"-" json:"product_count"`
}
