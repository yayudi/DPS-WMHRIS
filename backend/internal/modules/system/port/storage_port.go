package port

import "context"

// StorageService defines cloud object storage (Cloudflare R2 / S3) operations.
type StorageService interface {
	GeneratePresignedUploadUrl(ctx context.Context, originalName, mimeType, folder string) (url, key, publicURL string, err error)
	DeleteFromR2(ctx context.Context, key string) (bool, error)
	UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (r2Key string, err error)
	GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error)
}

// FirebaseSignalService defines real-time signal emission to Firebase Realtime Database.
type FirebaseSignalService interface {
	EmitSignal(ctx context.Context, path string, payload map[string]any) error
	EmitUserSignal(ctx context.Context, userID string, action string) error
	EmitSharedTaskSignal(ctx context.Context, permission string, action string) error
}
