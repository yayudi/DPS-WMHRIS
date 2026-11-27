package usecase

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/google/uuid"
)

// StorageService aliases the hexagonal port for backward compatibility.
type StorageService = port.StorageService

type storageServiceImpl struct{}

// NewStorageService constructs a Cloudflare R2-backed StorageService.
func NewStorageService() port.StorageService {
	return &storageServiceImpl{}
}

// SanitizeStorageFolder normalizes an object folder prefix and removes path traversal segments.
func SanitizeStorageFolder(folder, fallback string) string {
	cleaned := strings.ReplaceAll(strings.TrimSpace(folder), "\\", "/")
	parts := strings.Split(cleaned, "/")
	safeParts := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || p == "." || p == ".." {
			continue
		}
		safeParts = append(safeParts, p)
	}
	if len(safeParts) == 0 {
		return fallback
	}
	return path.Join(safeParts...)
}

// SanitizeStorageFilename strips directory paths, quotes, and control characters from uploaded filenames.
func SanitizeStorageFilename(originalName string) string {
	cleaned := strings.ReplaceAll(strings.TrimSpace(originalName), "\\", "/")
	base := path.Base(cleaned)
	if base == "" || base == "." || base == "/" {
		return "file"
	}
	safe := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' || r == '/' || r == ';' {
			return '_'
		}
		return r
	}, base)
	safe = strings.ReplaceAll(safe, "..", "")
	safe = strings.TrimSpace(safe)
	if safe == "" {
		return "file"
	}
	return safe
}

func resolveR2BucketName() (string, error) {
	bucket := strings.TrimSpace(config.AppConfig.R2BucketName)
	if bucket == "" {
		return "", fmt.Errorf("R2_BUCKET_NAME belum dikonfigurasi")
	}
	return bucket, nil
}

// GeneratePresignedUploadUrl creates a 5-minute presigned PUT URL for uploading directly to Cloudflare R2.
func (s *storageServiceImpl) GeneratePresignedUploadUrl(ctx context.Context, originalName, mimeType, folder string) (string, string, string, error) {
	if config.R2PresignClient == nil {
		return "", "", "", fmt.Errorf("S3 Client belum diinisialisasi. Periksa kredensial R2")
	}
	bucketName, err := resolveR2BucketName()
	if err != nil {
		return "", "", "", err
	}

	safeFolder := SanitizeStorageFolder(folder, "uploads")
	safeName := SanitizeStorageFilename(originalName)

	ext := strings.TrimPrefix(path.Ext(safeName), ".")
	randomStr := uuid.New().String()
	timestamp := time.Now().UnixMilli()

	uniqueFileName := fmt.Sprintf("%s/%d-%s", safeFolder, timestamp, randomStr)
	if ext != "" {
		uniqueFileName += "." + ext
	}

	req, err := config.R2PresignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(uniqueFileName),
		ContentType: aws.String(mimeType),
	}, func(po *s3.PresignOptions) {
		po.Expires = 5 * time.Minute
	})
	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal membuat presigned URL: %v", err)
		return "", "", "", err
	}

	baseURL := strings.TrimRight(strings.TrimSpace(config.AppConfig.R2PublicURL), "/")
	publicURL := uniqueFileName
	if baseURL != "" {
		publicURL = fmt.Sprintf("%s/%s", baseURL, uniqueFileName)
	}

	return req.URL, uniqueFileName, publicURL, nil
}

// DeleteFromR2 removes an object key from the configured R2 bucket.
func (s *storageServiceImpl) DeleteFromR2(ctx context.Context, key string) (bool, error) {
	if config.R2Client == nil {
		log.Println("[STORAGE_SERVICE] S3 Client belum diinisialisasi. Lewati penghapusan dari R2")
		return false, nil
	}
	if strings.TrimSpace(key) == "" {
		return false, nil
	}

	bucketName, err := resolveR2BucketName()
	if err != nil {
		return false, err
	}
	_, err = config.R2Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal menghapus file dari R2 %s: %v", key, err)
		return false, err
	}
	return true, nil
}

// UploadFile uploads a binary payload to Cloudflare R2 and returns its object key.
func (s *storageServiceImpl) UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (string, error) {
	if config.R2Client == nil {
		return "", fmt.Errorf("S3 Client belum diinisialisasi")
	}
	bucketName, err := resolveR2BucketName()
	if err != nil {
		return "", err
	}

	safeFolder := SanitizeStorageFolder(folder, "exports")
	safeName := SanitizeStorageFilename(originalName)
	timestamp := time.Now().UnixMilli()
	uniqueFileName := fmt.Sprintf("%s/%d-%s", safeFolder, timestamp, safeName)

	_, err = config.R2Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:             aws.String(bucketName),
		Key:                aws.String(uniqueFileName),
		Body:               bytes.NewReader(fileContent),
		ContentType:        aws.String(mimeType),
		ContentDisposition: aws.String(fmt.Sprintf(`attachment; filename="%s"`, safeName)),
	})
	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal mengupload file ke R2: %v", err)
		return "", err
	}

	return uniqueFileName, nil
}

// GeneratePresignedDownloadUrl creates a 5-minute presigned GET URL to download an object from R2.
func (s *storageServiceImpl) GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error) {
	if config.R2PresignClient == nil {
		return "", fmt.Errorf("S3 Presign Client belum diinisialisasi")
	}
	bucketName, err := resolveR2BucketName()
	if err != nil {
		return "", err
	}

	// Strip legacy full URL prefix if stored as full URL
	if strings.HasPrefix(r2Key, "https://") || strings.HasPrefix(r2Key, "http://") {
		parts := strings.SplitN(r2Key, "//", 2)
		if len(parts) == 2 {
			slashIdx := strings.Index(parts[1], "/")
			if slashIdx != -1 {
				r2Key = parts[1][slashIdx+1:]
			}
		}
	}

	req, err := config.R2PresignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(r2Key),
	}, func(po *s3.PresignOptions) {
		po.Expires = 5 * time.Minute
	})
	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal membuat presigned download URL untuk key %s: %v", r2Key, err)
		return "", err
	}

	return req.URL, nil
}
