package model

import (
	"time"

	database "github.com/dps-wmhris/backend/internal/shared/database"
)

type Product struct {
	database.BaseEntity
	SKU        string     `db:"sku" json:"sku"`
	Name       string     `db:"name" json:"name"`
	CategoryID *int       `db:"category_id" json:"category_id"` // Menggunakan *int karena telah diperbaiki oleh user di database
	Price      float64    `db:"price" json:"price"`
	IsActive   bool       `db:"is_active" json:"is_active"`
	DeletedAt  *time.Time `db:"deleted_at" json:"deleted_at"` // Pointer untuk penanganan soft delete NULL
	IsPackage  bool       `db:"is_package" json:"is_package"`
	Weight     float64    `db:"weight" json:"weight"`
	Length     float64    `db:"length" json:"length"`
	Width      float64    `db:"width" json:"width"`
	Height     float64    `db:"height" json:"height"`
}

type ProductImage struct {
	ID        int       `db:"id" json:"id"`
	ProductID int       `db:"product_id" json:"product_id"`
	MediaID   *int      `db:"media_id" json:"media_id"`
	IsPrimary bool      `db:"is_primary" json:"is_primary"`
	SortOrder int       `db:"sort_order" json:"sort_order"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type ProductAuditLog struct {
	ID        int       `db:"id" json:"id"`
	ProductID int       `db:"product_id" json:"product_id"`
	UserID    *int      `db:"user_id" json:"user_id"`
	Action    string    `db:"action" json:"action"`
	Field     *string   `db:"field" json:"field"`
	OldValue  *string   `db:"old_value" json:"old_value"`
	NewValue  *string   `db:"new_value" json:"new_value"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}
