package usecase

import (
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"bytes"
	"context"

	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"

	"github.com/xuri/excelize/v2"
)

// failExportJob returns the error directly as job failure status is centrally handled by the worker dispatcher.
func failExportJob(_ context.Context, _ int, err error, _ system_mysql.JobRepository) error {
	return err
}

// finalizeExportJob menangani penulisan ke buffer, upload ke R2, dan update status job hingga selesai.
func finalizeExportJob(ctx context.Context, f *excelize.File, jobID int, fileName string, folder string, jobRepo system_mysql.JobRepository, storageService system_usecase.StorageService) error {
	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return err
	}

	url, err := storageService.UploadFile(ctx, b.Bytes(), fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", folder)
	if err != nil {
		return err
	}

	_ = jobRepo.UpdateExportJobStatus(ctx, jobID, "COMPLETED", &url, nil) // #nosec G104
	return nil
}
