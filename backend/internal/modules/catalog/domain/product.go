package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type Product struct {
	kernel.BaseEntity
	kernel.SoftDeletable
	SKU        string  `db:"sku" json:"sku"`
	Name       string  `db:"name" json:"name"`
	CategoryID *int    `db:"category_id" json:"category_id"` // Menggunakan *int karena telah diperbaiki oleh user di database
	Price      float64 `db:"price" json:"price"`
	IsActive   bool    `db:"is_active" json:"is_active"`
	IsPackage  bool    `db:"is_package" json:"is_package"`
	Weight     float64 `db:"weight" json:"weight"`
	Length     float64 `db:"length" json:"length"`
	Width      float64 `db:"width" json:"width"`
	Height     float64 `db:"height" json:"height"`
}

type ProductImage struct {
	kernel.ImmutableEntity
	ProductID int  `db:"product_id" json:"product_id"`
	MediaID   *int `db:"media_id" json:"media_id"`
	IsPrimary bool `db:"is_primary" json:"is_primary"`
	SortOrder int  `db:"sort_order" json:"sort_order"`
}

type ProductAuditLog struct {
	kernel.ImmutableEntity
	ProductID int     `db:"product_id" json:"product_id"`
	UserID    *int    `db:"user_id" json:"user_id"`
	Action    string  `db:"action" json:"action"`
	Field     *string `db:"field" json:"field"`
	OldValue  *string `db:"old_value" json:"old_value"`
	NewValue  *string `db:"new_value" json:"new_value"`
}
