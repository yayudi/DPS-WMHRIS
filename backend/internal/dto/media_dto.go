package dto

import "encoding/json"

type MediaAssetResponse struct {
	ID             int              `json:"id" db:"id"`
	Title          string           `json:"title" db:"title"`
	MainPath       string           `json:"main_path" db:"main_path"`
	ThumbnailPath  *string          `json:"thumbnail_path" db:"thumbnail_path"`
	Status         string           `json:"status" db:"status"`
	UploaderID     *int             `json:"uploader_id" db:"uploader_id"`
	Tags           *json.RawMessage `json:"tags" db:"tags"`
	Hash           string           `json:"hash" db:"hash"`
	DuplicateOf    *int             `json:"duplicate_of" db:"duplicate_of"`
	SizeBytes      *int             `json:"size_bytes" db:"size_bytes"`
	Width          *int             `json:"width" db:"width"`
	Height         *int             `json:"height" db:"height"`
	CreatedAt      string           `json:"created_at" db:"created_at"`
	UpdatedAt      string           `json:"updated_at" db:"updated_at"`
	UsageCount     *int             `json:"usage_count,omitempty" db:"usage_count"`
	LinkedProducts *string          `json:"linked_products,omitempty" db:"linked_products"` // GROUP_CONCAT result
	Products       interface{}      `json:"products,omitempty"`                             // For detailed view
}

type UpdateMediaTagsRequest struct {
	Tags []string `json:"tags" binding:"required"`
}

type UpdateMediaTitleRequest struct {
	Title string `json:"title" binding:"required"`
}

type PresignedUrlRequest struct {
	Files []PresignedUrlFile `json:"files" binding:"required,dive"`
}

type PresignedUrlFile struct {
	Name string `json:"name" binding:"required"`
	Type string `json:"type" binding:"required"`
}

type SinglePresignedUrlRequest struct {
	FileName string `json:"fileName" binding:"required"`
	MimeType string `json:"mimeType" binding:"required"`
	Folder   string `json:"folder"`
}

type ConfirmUploadRequest struct {
	Assets   []ConfirmUploadAsset `json:"assets" binding:"required,dive"`
	Products interface{}          `json:"products"` // can be int or []int
}

type ConfirmUploadAsset struct {
	Title         string   `json:"title"`
	MainPath      string   `json:"mainPath"`
	ThumbnailPath string   `json:"thumbnailPath"`
	Tags          []string `json:"tags"`
	Hash          string   `json:"hash"`
	SizeBytes     int      `json:"sizeBytes"`
	Width         int      `json:"width"`
	Height        int      `json:"height"`
}
