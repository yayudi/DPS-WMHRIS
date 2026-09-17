package usecase

import (
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"bytes"
	"context"

	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"

	"github.com/xuri/excelize/v2"
)

// failExportJob mencatat error ke database job dan mengubah status menjadi FAILED
func failExportJob(ctx context.Context, jobID int, err error, jobRepo system_mysql.JobRepository) error {
	errMsg := err.Error()
	_ = jobRepo.UpdateExportJobStatus(ctx, jobID, "FAILED", nil, &errMsg) // #nosec G104
	return err
}

// finalizeExportJob menangani penulisan ke buffer, upload ke R2, dan update status job hingga selesai.
func finalizeExportJob(ctx context.Context, f *excelize.File, jobID int, fileName string, folder string, jobRepo system_mysql.JobRepository, storageService system_usecase.StorageService) error {
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return failExportJob(ctx, jobID, err, jobRepo)
	}

	url, err := storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", folder)
	if err != nil {
		return failExportJob(ctx, jobID, err, jobRepo)
	}

	_ = jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil) // #nosec G104
	return nil
}
