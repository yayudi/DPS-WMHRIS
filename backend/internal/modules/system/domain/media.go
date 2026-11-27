package domain

import (
	"encoding/json"
	"fmt"
	"time"
)

// MediaAsset represents a row in the media_assets table matching schema.sql.
type MediaAsset struct {
	ID            int              `db:"id" json:"id"`
	Title         *string          `db:"title" json:"title"`
	MainPath      *string          `db:"main_path" json:"main_path"`
	ThumbnailPath *string          `db:"thumbnail_path" json:"thumbnail_path"`
	Status        *string          `db:"status" json:"status"`
	SizeBytes     *int             `db:"size_bytes" json:"size_bytes"`
	Width         *int             `db:"width" json:"width"`
	Height        *int             `db:"height" json:"height"`
	UploaderID    *int             `db:"uploader_id" json:"uploader_id"`
	CreatedAt     time.Time        `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time        `db:"updated_at" json:"updated_at"`
	Tags          *json.RawMessage `db:"tags" json:"tags"`
	Hash          *string          `db:"hash" json:"hash"`
	DuplicateOf   *int             `db:"duplicate_of" json:"duplicate_of"`
}

// DuplicateMediaError indicates that an uploaded media file matches the SHA-256 hash of an existing asset.
type DuplicateMediaError struct {
	DuplicateOf int
}

// Error implements the error interface.
func (e DuplicateMediaError) Error() string {
	return fmt.Sprintf("Duplicate media of %d", e.DuplicateOf)
}
