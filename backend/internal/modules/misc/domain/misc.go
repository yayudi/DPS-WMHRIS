// Package domain defines core entities, domain helpers, and custom errors for the misc module.
package domain

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

var (
	// ErrPaperSizeNotFound is returned when a paper size record does not exist.
	ErrPaperSizeNotFound = apperror.NotFound("settings.paper_size.not_found", "ukuran kertas tidak ditemukan")
	// ErrStickerTemplateNotFound is returned when a sticker template record does not exist.
	ErrStickerTemplateNotFound = apperror.NotFound("settings.sticker_template.not_found", "template stiker tidak ditemukan")
	// ErrInvalidConfigJSON is returned when sticker template config_json is not valid JSON.
	ErrInvalidConfigJSON = apperror.Validation("settings.sticker_template.invalid_config_json", "format config_json tidak valid")
)

// PaperSize represents a row in the paper_sizes table.
type PaperSize struct {
	ID              int       `db:"id" json:"id"`
	Name            string    `db:"name" json:"name"`
	TopMargin       float64   `db:"top_margin" json:"topMargin"`
	SideMargin      float64   `db:"side_margin" json:"sideMargin"`
	VerticalPitch   float64   `db:"vertical_pitch" json:"verticalPitch"`
	HorizontalPitch float64   `db:"horizontal_pitch" json:"horizontalPitch"`
	LabelWidth      float64   `db:"label_width" json:"labelWidth"`
	LabelHeight     float64   `db:"label_height" json:"labelHeight"`
	NumberAcross    int       `db:"number_across" json:"numberAcross"`
	NumberDown      int       `db:"number_down" json:"numberDown"`
	PageWidth       float64   `db:"page_width" json:"pageWidth"`
	PageHeight      float64   `db:"page_height" json:"pageHeight"`
	IsActive        bool      `db:"is_active" json:"is_active"`
	CreatedAt       time.Time `db:"created_at" json:"created_at"`
	UpdatedAt       time.Time `db:"updated_at" json:"updated_at"`
}

// StickerTemplate represents a row in the sticker_templates table.
type StickerTemplate struct {
	ID         int       `db:"id" json:"id"`
	Name       string    `db:"name" json:"name"`
	PaperSize  string    `db:"paper_size" json:"paper_size"`
	ConfigJSON *string   `db:"config_json" json:"config_json"`
	IsActive   bool      `db:"is_active" json:"is_active"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
}

// NormalizeConfigJSON converts a sticker template config payload (either a raw JSON string
// from the frontend canvas or an arbitrary JSON object/value) into a single-encoded valid JSON string.
func NormalizeConfigJSON(raw any) (*string, error) {
	if raw == nil {
		return nil, nil
	}

	switch v := raw.(type) {
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil, nil
		}
		if !json.Valid([]byte(trimmed)) {
			return nil, ErrInvalidConfigJSON
		}
		return &trimmed, nil
	case json.RawMessage:
		trimmed := strings.TrimSpace(string(v))
		if trimmed == "" || trimmed == "null" {
			return nil, nil
		}
		if !json.Valid([]byte(trimmed)) {
			return nil, ErrInvalidConfigJSON
		}
		return &trimmed, nil
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, ErrInvalidConfigJSON
		}
		str := string(encoded)
		if str == "null" {
			return nil, nil
		}
		return &str, nil
	}
}
