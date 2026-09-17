package misc_dto

type CreatePaperSizeRequest struct {
	Name            string  `json:"name" binding:"required"`
	TopMargin       float64 `json:"top_margin"`
	SideMargin      float64 `json:"side_margin"`
	VerticalPitch   float64 `json:"vertical_pitch"`
	HorizontalPitch float64 `json:"horizontal_pitch"`
	LabelWidth      float64 `json:"label_width" binding:"required"`
	LabelHeight     float64 `json:"label_height" binding:"required"`
	NumberAcross    int     `json:"number_across"`
	NumberDown      int     `json:"number_down"`
	PageWidth       float64 `json:"page_width" binding:"required"`
	PageHeight      float64 `json:"page_height" binding:"required"`
}

type UpdatePaperSizeRequest struct {
	Name            string  `json:"name" binding:"required"`
	TopMargin       float64 `json:"top_margin"`
	SideMargin      float64 `json:"side_margin"`
	VerticalPitch   float64 `json:"vertical_pitch"`
	HorizontalPitch float64 `json:"horizontal_pitch"`
	LabelWidth      float64 `json:"label_width" binding:"required"`
	LabelHeight     float64 `json:"label_height" binding:"required"`
	NumberAcross    int     `json:"number_across"`
	NumberDown      int     `json:"number_down"`
	PageWidth       float64 `json:"page_width" binding:"required"`
	PageHeight      float64 `json:"page_height" binding:"required"`
}

type PaperSizeResponse struct {
	ID              int     `json:"id" db:"id"`
	Name            string  `json:"name" db:"name"`
	TopMargin       float64 `json:"top_margin" db:"top_margin"`
	SideMargin      float64 `json:"side_margin" db:"side_margin"`
	VerticalPitch   float64 `json:"vertical_pitch" db:"vertical_pitch"`
	HorizontalPitch float64 `json:"horizontal_pitch" db:"horizontal_pitch"`
	LabelWidth      float64 `json:"label_width" db:"label_width"`
	LabelHeight     float64 `json:"label_height" db:"label_height"`
	NumberAcross    int     `json:"number_across" db:"number_across"`
	NumberDown      int     `json:"number_down" db:"number_down"`
	PageWidth       float64 `json:"page_width" db:"page_width"`
	PageHeight      float64 `json:"page_height" db:"page_height"`
	IsActive        bool    `json:"is_active" db:"is_active"`
}

type CreateStickerTemplateRequest struct {
	Name       string      `json:"name" binding:"required"`
	PaperSize  string      `json:"paper_size"`
	ConfigJSON interface{} `json:"config_json"`
	IsActive   *bool       `json:"is_active"`
}

type UpdateStickerTemplateRequest struct {
	Name       string      `json:"name" binding:"required"`
	PaperSize  string      `json:"paper_size"`
	ConfigJSON interface{} `json:"config_json"`
	IsActive   *bool       `json:"is_active"`
}

type StickerTemplateResponse struct {
	ID         int     `json:"id" db:"id"`
	Name       string  `json:"name" db:"name"`
	PaperSize  string  `json:"paper_size" db:"paper_size"`
	ConfigJSON *string `json:"config_json" db:"config_json"`
	IsActive   bool    `json:"is_active" db:"is_active"`
	CreatedAt  string  `json:"created_at" db:"created_at"`
	UpdatedAt  string  `json:"updated_at" db:"updated_at"`
}
