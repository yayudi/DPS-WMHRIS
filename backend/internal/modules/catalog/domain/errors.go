// Package domain defines core entities, sentinel errors, and validation rules for the catalog bounded context.
package domain

import (
	"math"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// Category status filter constants.
const (
	CategoryStatusActive   = "active"
	CategoryStatusArchived = "archived"
	CategoryStatusAll      = "all"
)

// Product audit log action constants matching product_audit_logs.action values.
const (
	ProductAuditActionCreate    = "CREATE"
	ProductAuditActionUpdate    = "UPDATE"
	ProductAuditActionDelete    = "DELETE"
	ProductAuditActionRestore   = "RESTORE"
	ProductAuditActionLinkMedia = "LINK_MEDIA"
)

var (
	// ErrProductNotFound is returned when a product record cannot be found.
	ErrProductNotFound = apperror.NotFound("master_data.product.not_found", "produk tidak ditemukan")
	// ErrDuplicateSKU is returned when attempting to create or update a product with an existing SKU.
	ErrDuplicateSKU = apperror.Conflict("master_data.product.duplicate_sku", "SKU produk sudah digunakan")
	// ErrInvalidProductPayload is returned when product fields violate domain invariants (e.g. blank SKU/name or negative metrics).
	ErrInvalidProductPayload = apperror.Validation("master_data.product.invalid_payload", "data produk tidak valid")
	// ErrProductImageNotFound is returned when a product image mapping cannot be found.
	ErrProductImageNotFound = apperror.NotFound("master_data.product.image_not_found", "gambar produk tidak ditemukan")
	// ErrEmptyMediaIDs is returned when linking media with an empty or invalid media ID list.
	ErrEmptyMediaIDs = apperror.Validation("master_data.product.empty_media_ids", "daftar media wajib diisi dengan ID positif")
	// ErrCategoryNotFound is returned when a category record cannot be found.
	ErrCategoryNotFound = apperror.NotFound("master_data.category.not_found", "kategori tidak ditemukan")
	// ErrDuplicateCategoryName is returned when a category name conflicts with an existing category.
	ErrDuplicateCategoryName = apperror.Conflict("master_data.category.duplicate_name", "nama kategori sudah digunakan")
	// ErrInvalidCategoryName is returned when a category name is empty or whitespace-only.
	ErrInvalidCategoryName = apperror.Validation("master_data.category.invalid_name", "nama kategori wajib diisi")
	// ErrInvalidCategoryStatus is returned when the requested category filter status is unsupported.
	ErrInvalidCategoryStatus = apperror.Validation("master_data.category.invalid_status", "status kategori tidak valid, gunakan active, archived, atau all")
)

// NormalizeCategoryStatus trims and validates a category status query parameter, defaulting empty values to "active".
func NormalizeCategoryStatus(status string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(status))
	if normalized == "" {
		return CategoryStatusActive, nil
	}
	switch normalized {
	case CategoryStatusActive, CategoryStatusArchived, CategoryStatusAll:
		return normalized, nil
	default:
		return "", ErrInvalidCategoryStatus
	}
}

// ValidateProductMetrics verifies that product pricing and physical dimensions are finite and non-negative.
func ValidateProductMetrics(price, weight, length, width, height float64) error {
	values := []float64{price, weight, length, width, height}
	for _, v := range values {
		if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
			return ErrInvalidProductPayload
		}
	}
	return nil
}
