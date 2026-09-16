package model

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"
)

type Category struct {
	database.BaseEntity
	Name     string `db:"name" json:"name"`
	IsActive bool   `db:"is_active" json:"is_active"`
}
