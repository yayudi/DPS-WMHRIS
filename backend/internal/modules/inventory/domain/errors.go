// Package domain defines core entities, sentinel errors, and domain invariants for the inventory bounded context.
package domain

import (
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// Location purpose constants matching locations.purpose values.
const (
	LocationPurposeDisplay   = "DISPLAY"
	LocationPurposeWarehouse = "WAREHOUSE"
	LocationPurposeReceiving = "RECEIVING"
	LocationPurposeQA        = "QA"
	LocationPurposeTransit   = "TRANSIT"
	LocationPurposeBadStock  = "BAD_STOCK"
	LocationPurposeWorkshop  = "WORKSHOP"
	LocationPurposeBranch    = "BRANCH"
)

// Stock request type constants matching stock_requests.type values.
const (
	StockRequestTypeTransfer    = "TRANSFER"
	StockRequestTypeStockOpname = "STOCK_OPNAME"
)

// Stock request lifecycle status constants matching stock_requests.status ENUM values.
const (
	StockRequestStatusPending   = "PENDING"
	StockRequestStatusApproved  = "APPROVED"
	StockRequestStatusRejected  = "REJECTED"
	StockRequestStatusShipped   = "SHIPPED"
	StockRequestStatusCompleted = "COMPLETED"
)

// Sales channel platform constants matching sales_channels.platform ENUM values.
const (
	SalesChannelPlatformShopee    = "Shopee"
	SalesChannelPlatformTokopedia = "Tokopedia"
	SalesChannelPlatformOffline   = "Offline"
	SalesChannelPlatformOther     = "Lainnya"
)

var (
	// ErrLocationNotFound is returned when a warehouse location cannot be found.
	ErrLocationNotFound = apperror.NotFound("master_data.location.err_not_found", "Lokasi tidak ditemukan")
	// ErrDuplicateLocationCode is returned when a location code conflicts with an existing location.
	ErrDuplicateLocationCode = apperror.Conflict("master_data.location.err_duplicate_code", "Kode lokasi sudah digunakan")
	// ErrInvalidLocationPayload is returned when required location fields are empty or invalid.
	ErrInvalidLocationPayload = apperror.Validation("master_data.location.err_invalid_payload", "Data lokasi tidak valid")
	// ErrStockRequestNotFound is returned when a stock request cannot be found.
	ErrStockRequestNotFound = apperror.NotFound("wms.stock_request.err_not_found", "Permintaan stok tidak ditemukan.")
	// ErrInvalidStockRequestType is returned when stock request type is neither TRANSFER nor STOCK_OPNAME.
	ErrInvalidStockRequestType = apperror.Validation("wms.stock_request.err_invalid_type", "Tipe permintaan stok tidak valid")
	// ErrStockRequestEmptyItems is returned when a stock request has no line items to process.
	ErrStockRequestEmptyItems = apperror.Validation("wms.stock_request.err_min_items", "Minimal harus ada satu produk yang diminta.")
	// ErrSalesChannelNotFound is returned when a sales channel record cannot be found.
	ErrSalesChannelNotFound = apperror.NotFound("master_data.sales_channel.not_found", "Channel penjualan tidak ditemukan")
	// ErrInvalidSalesChannelPayload is returned when sales channel name or required attributes are blank.
	ErrInvalidSalesChannelPayload = apperror.Validation("master_data.sales_channel.invalid_payload", "Data channel penjualan tidak valid")
	// ErrInvalidSalesChannelPlatform is returned when platform is outside Shopee, Tokopedia, Offline, or Lainnya.
	ErrInvalidSalesChannelPlatform = apperror.Validation("master_data.sales_channel.invalid_platform", "Platform channel penjualan tidak valid")
)

// ValidateFulfillmentSourcePurpose rejects enabling automatic fulfillment sourcing on non-sellable location purposes.
func ValidateFulfillmentSourcePurpose(purpose string, isFulfillmentSource bool) error {
	if !isFulfillmentSource {
		return nil
	}
	normalized := strings.ToUpper(strings.TrimSpace(purpose))
	switch normalized {
	case LocationPurposeBadStock, LocationPurposeWorkshop, LocationPurposeBranch:
		return apperror.Validation(
			"master_data.location.err_purpose_invalid",
			"lokasi dengan purpose "+normalized+" tidak dapat dijadikan sumber fulfillment",
			map[string]any{"purpose": normalized},
		)
	default:
		return nil
	}
}

// ValidateSalesChannelPlatform validates that platform matches the sales_channels.platform ENUM values.
func ValidateSalesChannelPlatform(platform string) error {
	switch strings.TrimSpace(platform) {
	case SalesChannelPlatformShopee,
		SalesChannelPlatformTokopedia,
		SalesChannelPlatformOffline,
		SalesChannelPlatformOther:
		return nil
	default:
		return ErrInvalidSalesChannelPlatform
	}
}

// ValidateStockRequestType validates that reqType is a supported stock request type.
func ValidateStockRequestType(reqType string) error {
	switch strings.TrimSpace(reqType) {
	case StockRequestTypeTransfer, StockRequestTypeStockOpname:
		return nil
	default:
		return ErrInvalidStockRequestType
	}
}
