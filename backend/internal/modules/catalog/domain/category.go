package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type Category struct {
	kernel.BaseEntity
	Name     string `db:"name" json:"name"`
	IsActive bool   `db:"is_active" json:"is_active"`
}
