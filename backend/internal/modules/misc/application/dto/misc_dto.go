// Package misc_dto defines request and response DTOs for the misc module.
package misc_dto

import "encoding/json"

// paperSizeWirePayload supports both camelCase (Vue frontend) and snake_case (REST/SQL convention)
// JSON field names when unmarshaling create/update paper size requests.
type paperSizeWirePayload struct {
	Name            string   `json:"name"`
	TopMargin       *float64 `json:"topMargin"`
	TopMarginSnake  *float64 `json:"top_margin"`
	SideMargin      *float64 `json:"sideMargin"`
	SideMarginSnake *float64 `json:"side_margin"`
	VertPitch       *float64 `json:"verticalPitch"`
	VertPitchSnake  *float64 `json:"vertical_pitch"`
	HorizPitch      *float64 `json:"horizontalPitch"`
	HorizPitchSnake *float64 `json:"horizontal_pitch"`
	LabelWidth      *float64 `json:"labelWidth"`
	LabelWidthSnake *float64 `json:"label_width"`
	LabelHeight     *float64 `json:"labelHeight"`
	LabelHeightSnk  *float64 `json:"label_height"`
	NumberAcross    *int     `json:"numberAcross"`
	NumberAcrossSnk *int     `json:"number_across"`
	NumberDown      *int     `json:"numberDown"`
	NumberDownSnake *int     `json:"number_down"`
	PageWidth       *float64 `json:"pageWidth"`
	PageWidthSnake  *float64 `json:"page_width"`
	PageHeight      *float64 `json:"pageHeight"`
	PageHeightSnake *float64 `json:"page_height"`
}

func firstFloat(primary, fallback *float64) float64 {
	if primary != nil {
		return *primary
	}
	if fallback != nil {
		return *fallback
	}
	return 0
}

func firstInt(primary, fallback *int) int {
	if primary != nil {
		return *primary
	}
	if fallback != nil {
		return *fallback
	}
	return 0
}

// CreatePaperSizeRequest defines the payload for creating a label/paper size preset.
type CreatePaperSizeRequest struct {
	Name            string  `json:"name" binding:"required"`
	TopMargin       float64 `json:"topMargin"`
	SideMargin      float64 `json:"sideMargin"`
	VerticalPitch   float64 `json:"verticalPitch"`
	HorizontalPitch float64 `json:"horizontalPitch"`
	LabelWidth      float64 `json:"labelWidth" binding:"required,gt=0"`
	LabelHeight     float64 `json:"labelHeight" binding:"required,gt=0"`
	NumberAcross    int     `json:"numberAcross"`
	NumberDown      int     `json:"numberDown"`
	PageWidth       float64 `json:"pageWidth" binding:"required,gt=0"`
	PageHeight      float64 `json:"pageHeight" binding:"required,gt=0"`
}

// UnmarshalJSON accepts both camelCase and snake_case keys for CreatePaperSizeRequest.
func (r *CreatePaperSizeRequest) UnmarshalJSON(data []byte) error {
	var wire paperSizeWirePayload
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	r.Name = wire.Name
	r.TopMargin = firstFloat(wire.TopMargin, wire.TopMarginSnake)
	r.SideMargin = firstFloat(wire.SideMargin, wire.SideMarginSnake)
	r.VerticalPitch = firstFloat(wire.VertPitch, wire.VertPitchSnake)
	r.HorizontalPitch = firstFloat(wire.HorizPitch, wire.HorizPitchSnake)
	r.LabelWidth = firstFloat(wire.LabelWidth, wire.LabelWidthSnake)
	r.LabelHeight = firstFloat(wire.LabelHeight, wire.LabelHeightSnk)
	r.NumberAcross = firstInt(wire.NumberAcross, wire.NumberAcrossSnk)
	r.NumberDown = firstInt(wire.NumberDown, wire.NumberDownSnake)
	r.PageWidth = firstFloat(wire.PageWidth, wire.PageWidthSnake)
	r.PageHeight = firstFloat(wire.PageHeight, wire.PageHeightSnake)
	return nil
}

// UpdatePaperSizeRequest defines the payload for updating an existing label/paper size preset.
type UpdatePaperSizeRequest struct {
	Name            string  `json:"name" binding:"required"`
	TopMargin       float64 `json:"topMargin"`
	SideMargin      float64 `json:"sideMargin"`
	VerticalPitch   float64 `json:"verticalPitch"`
	HorizontalPitch float64 `json:"horizontalPitch"`
	LabelWidth      float64 `json:"labelWidth" binding:"required,gt=0"`
	LabelHeight     float64 `json:"labelHeight" binding:"required,gt=0"`
	NumberAcross    int     `json:"numberAcross"`
	NumberDown      int     `json:"numberDown"`
	PageWidth       float64 `json:"pageWidth" binding:"required,gt=0"`
	PageHeight      float64 `json:"pageHeight" binding:"required,gt=0"`
}

// UnmarshalJSON accepts both camelCase and snake_case keys for UpdatePaperSizeRequest.
func (r *UpdatePaperSizeRequest) UnmarshalJSON(data []byte) error {
	var wire paperSizeWirePayload
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	r.Name = wire.Name
	r.TopMargin = firstFloat(wire.TopMargin, wire.TopMarginSnake)
	r.SideMargin = firstFloat(wire.SideMargin, wire.SideMarginSnake)
	r.VerticalPitch = firstFloat(wire.VertPitch, wire.VertPitchSnake)
	r.HorizontalPitch = firstFloat(wire.HorizPitch, wire.HorizPitchSnake)
	r.LabelWidth = firstFloat(wire.LabelWidth, wire.LabelWidthSnake)
	r.LabelHeight = firstFloat(wire.LabelHeight, wire.LabelHeightSnk)
	r.NumberAcross = firstInt(wire.NumberAcross, wire.NumberAcrossSnk)
	r.NumberDown = firstInt(wire.NumberDown, wire.NumberDownSnake)
	r.PageWidth = firstFloat(wire.PageWidth, wire.PageWidthSnake)
	r.PageHeight = firstFloat(wire.PageHeight, wire.PageHeightSnake)
	return nil
}

// PaperSizeResponse represents a paper size preset serialized with camelCase dimensions
// matching the sticker builder and paper size manager UI contracts.
type PaperSizeResponse struct {
	ID              int     `json:"id" db:"id"`
	Name            string  `json:"name" db:"name"`
	TopMargin       float64 `json:"topMargin" db:"top_margin"`
	SideMargin      float64 `json:"sideMargin" db:"side_margin"`
	VerticalPitch   float64 `json:"verticalPitch" db:"vertical_pitch"`
	HorizontalPitch float64 `json:"horizontalPitch" db:"horizontal_pitch"`
	LabelWidth      float64 `json:"labelWidth" db:"label_width"`
	LabelHeight     float64 `json:"labelHeight" db:"label_height"`
	NumberAcross    int     `json:"numberAcross" db:"number_across"`
	NumberDown      int     `json:"numberDown" db:"number_down"`
	PageWidth       float64 `json:"pageWidth" db:"page_width"`
	PageHeight      float64 `json:"pageHeight" db:"page_height"`
	IsActive        bool    `json:"is_active" db:"is_active"`
}

// CreateStickerTemplateRequest defines the payload for creating a sticker template.
type CreateStickerTemplateRequest struct {
	Name       string `json:"name" binding:"required"`
	PaperSize  string `json:"paper_size"`
	ConfigJSON any    `json:"config_json"`
	IsActive   *bool  `json:"is_active"`
}

// UpdateStickerTemplateRequest defines the payload for updating an existing sticker template.
type UpdateStickerTemplateRequest struct {
	Name       string `json:"name" binding:"required"`
	PaperSize  string `json:"paper_size"`
	ConfigJSON any    `json:"config_json"`
	IsActive   *bool  `json:"is_active"`
}

// StickerTemplateResponse represents a sticker template row returned to API clients.
type StickerTemplateResponse struct {
	ID         int     `json:"id" db:"id"`
	Name       string  `json:"name" db:"name"`
	PaperSize  string  `json:"paper_size" db:"paper_size"`
	ConfigJSON *string `json:"config_json" db:"config_json"`
	IsActive   bool    `json:"is_active" db:"is_active"`
	CreatedAt  string  `json:"created_at" db:"created_at"`
	UpdatedAt  string  `json:"updated_at" db:"updated_at"`
}
