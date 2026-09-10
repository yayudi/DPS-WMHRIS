package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/dps-wmhris/backend/internal/config"
	"github.com/google/uuid"
)

type StorageService interface {
	GeneratePresignedUploadUrl(ctx context.Context, originalName, mimeType, folder string) (url, key, publicUrl string, err error)
	DeleteFromR2(ctx context.Context, key string) (bool, error)
	UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (r2Key string, err error)
	GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error)
}

type storageServiceImpl struct{}

func NewStorageService() StorageService {
	return &storageServiceImpl{}
}

func (s *storageServiceImpl) GeneratePresignedUploadUrl(ctx context.Context, originalName, mimeType, folder string) (string, string, string, error) {
	if config.R2PresignClient == nil {
		return "", "", "", fmt.Errorf("S3 Client belum diinisialisasi. Periksa kredensial R2")
	}

	if folder == "" {
		folder = "uploads"
	}

	parts := strings.Split(originalName, ".")
	ext := parts[len(parts)-1]
	if len(parts) == 1 {
		ext = "" // no extension
	}

	randomStr := uuid.New().String()
	timestamp := time.Now().UnixMilli()

	uniqueFileName := fmt.Sprintf("%s/%d-%s", folder, timestamp, randomStr)
	if ext != "" {
		uniqueFileName += "." + ext
	}

	bucketName := os.Getenv("R2_BUCKET_NAME")

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

	baseURL := strings.TrimRight(os.Getenv("R2_PUBLIC_URL"), "/")
	publicUrl := fmt.Sprintf("%s/%s", baseURL, uniqueFileName)

	return req.URL, uniqueFileName, publicUrl, nil
}

func (s *storageServiceImpl) DeleteFromR2(ctx context.Context, key string) (bool, error) {
	if config.R2Client == nil {
		log.Println("[STORAGE_SERVICE] S3 Client belum diinisialisasi. Lewati penghapusan dari R2")
		return false, nil
	}
	if key == "" {
		return false, nil
	}

	bucketName := os.Getenv("R2_BUCKET_NAME")
	_, err := config.R2Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})

	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal menghapus file dari R2 %s: %v", key, err)
		return false, err
	}
	return true, nil
}

func (s *storageServiceImpl) UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (string, error) {
	if config.R2Client == nil {
		return "", fmt.Errorf("S3 Client belum diinisialisasi")
	}

	if folder == "" {
		folder = "exports"
	}

	timestamp := time.Now().UnixMilli()

	// Gunakan timestamp + originalName agar rapi namun tetap unik
	uniqueFileName := fmt.Sprintf("%s/%d-%s", folder, timestamp, originalName)

	bucketName := os.Getenv("R2_BUCKET_NAME")

	_, err := config.R2Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:             aws.String(bucketName),
		Key:                aws.String(uniqueFileName),
		Body:               strings.NewReader(string(fileContent)),
		ContentType:        aws.String(mimeType),
		ContentDisposition: aws.String(fmt.Sprintf("attachment; filename=\"%s\"", originalName)),
	})

	if err != nil {
		log.Printf("[STORAGE_SERVICE] Gagal mengupload file ke R2: %v", err)
		return "", err
	}

	// Return R2 key saja, bukan full URL. Download akan via presigned URL.
	return uniqueFileName, nil
}

// GeneratePresignedDownloadUrl membuat presigned GET URL untuk mendownload file dari R2.
// URL akan expire setelah 5 menit. Menggunakan R2_ENDPOINT langsung, tidak bergantung pada custom domain.
func (s *storageServiceImpl) GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error) {
	if config.R2PresignClient == nil {
		return "", fmt.Errorf("S3 Presign Client belum diinisialisasi")
	}

	// Handle legacy: strip full R2 URL prefix jika ada
	if strings.HasPrefix(r2Key, "https://") || strings.HasPrefix(r2Key, "http://") {
		// Cari posisi setelah domain + "/"
		// e.g. "https://pub-xxx.r2.dev/exports/file.xlsx" → "exports/file.xlsx"
		parts := strings.SplitN(r2Key, "//", 2)
		if len(parts) == 2 {
			slashIdx := strings.Index(parts[1], "/")
			if slashIdx != -1 {
				r2Key = parts[1][slashIdx+1:]
			}
		}
	}

	bucketName := os.Getenv("R2_BUCKET_NAME")

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
