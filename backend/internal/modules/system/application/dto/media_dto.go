package system_dto

import "encoding/json"

// MediaFilter defines search and product-link status filters for querying media assets.
type MediaFilter struct {
	Search     string
	LinkStatus map[string][]string // e.g. {"include": ["linked"], "exclude": ["orphaned"]}
	RawStatus  string              // fallback: "linked" or "orphaned"
}

// MediaAssetResponse represents a media asset item returned by list, detail, or status endpoints.
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
	Products       any              `json:"products,omitempty"`                             // For detailed view
}

// UpdateMediaTagsRequest defines the payload for updating a media asset's tags.
type UpdateMediaTagsRequest struct {
	Tags []string `json:"tags" binding:"required"`
}

// UpdateMediaTitleRequest defines the payload for renaming a media asset's title.
type UpdateMediaTitleRequest struct {
	Title string `json:"title" binding:"required"`
}

// PresignedUrlRequest defines a batch request for R2 presigned upload URLs.
type PresignedUrlRequest struct {
	Files []PresignedUrlFile `json:"files" binding:"required,dive"`
}

// PresignedUrlFile describes a single file entry inside PresignedUrlRequest.
type PresignedUrlFile struct {
	Name string `json:"name" binding:"required"`
	Type string `json:"type" binding:"required"`
}

// SinglePresignedUrlRequest defines a single-file presigned upload URL request.
type SinglePresignedUrlRequest struct {
	FileName string `json:"fileName" binding:"required"`
	MimeType string `json:"mimeType" binding:"required"`
	Folder   string `json:"folder"`
}

// ConfirmUploadRequest defines the payload confirming completed client-side R2 uploads.
type ConfirmUploadRequest struct {
	Assets   []ConfirmUploadAsset `json:"assets" binding:"required,dive"`
	Products any                  `json:"products"` // can be int/float64 or []int/[]any
}

// ConfirmUploadAsset carries metadata for a single uploaded asset being registered in the database.
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
