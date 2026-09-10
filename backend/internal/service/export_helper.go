package service

import (
	"bytes"
	"context"

	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/xuri/excelize/v2"
)

// failExportJob mencatat error ke database job dan mengubah status menjadi FAILED
func failExportJob(ctx context.Context, jobID int, err error, jobRepo repository.JobRepository) error {
	errMsg := err.Error()
	jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg)
	return err
}

// finalizeExportJob menangani penulisan ke buffer, upload ke R2, dan update status job hingga selesai.
func finalizeExportJob(ctx context.Context, f *excelize.File, jobID int, fileName string, folder string, jobRepo repository.JobRepository, storageService StorageService) error {
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return failExportJob(ctx, jobID, err, jobRepo)
	}

	url, err := storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", folder)
	if err != nil {
		return failExportJob(ctx, jobID, err, jobRepo)
	}

	jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil)
	return nil
}
