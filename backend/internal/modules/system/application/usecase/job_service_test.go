package usecase_test

import (
	"context"
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type mockJobRepo struct {
	importJobs []system_domain.ImportJob
	exportJobs []system_domain.ExportJob
	lastUserID *int
}

func (m *mockJobRepo) CreateImportJob(ctx context.Context, job *system_domain.ImportJob) (int, error) {
	job.ID = len(m.importJobs) + 1
	m.importJobs = append(m.importJobs, *job)
	return job.ID, nil
}

func (m *mockJobRepo) GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ImportJob], error) {
	m.lastUserID = userID
	var filtered []system_domain.ImportJob
	for _, j := range m.importJobs {
		if userID == nil || j.UserID == *userID {
			filtered = append(filtered, j)
		}
	}
	return utils.PaginatedResult[system_domain.ImportJob]{
		Data:       filtered,
		Total:      len(filtered),
		Page:       page,
		Limit:      limit,
		TotalPages: 1,
	}, nil
}

func (m *mockJobRepo) GetImportJobByID(ctx context.Context, id int) (*system_domain.ImportJob, error) {
	for _, j := range m.importJobs {
		if j.ID == id {
			return &j, nil
		}
	}
	return nil, nil
}

func (m *mockJobRepo) UpdateImportJobStatus(ctx context.Context, id int, status string, logSummary *string, errorLog *string) error {
	for i, j := range m.importJobs {
		if j.ID == id {
			m.importJobs[i].Status = status
			return nil
		}
	}
	return nil
}

func (m *mockJobRepo) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	return nil
}

func (m *mockJobRepo) GetPendingImportJobs(ctx context.Context) ([]system_domain.ImportJob, error) {
	return nil, nil
}

func (m *mockJobRepo) ClaimNextImportJob(ctx context.Context) (*system_domain.ImportJob, error) {
	return nil, nil
}

func (m *mockJobRepo) RecoverStuckImportJobs(ctx context.Context) (int, error) {
	return 0, nil
}

func (m *mockJobRepo) CreateExportJob(ctx context.Context, job *system_domain.ExportJob) (int, error) {
	job.ID = len(m.exportJobs) + 1
	m.exportJobs = append(m.exportJobs, *job)
	return job.ID, nil
}

func (m *mockJobRepo) GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[system_domain.ExportJob], error) {
	m.lastUserID = userID
	var filtered []system_domain.ExportJob
	for _, j := range m.exportJobs {
		if userID == nil || j.UserID == *userID {
			filtered = append(filtered, j)
		}
	}
	return utils.PaginatedResult[system_domain.ExportJob]{
		Data:       filtered,
		Total:      len(filtered),
		Page:       page,
		Limit:      limit,
		TotalPages: 1,
	}, nil
}

func (m *mockJobRepo) GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error) {
	for _, j := range m.exportJobs {
		if j.ID == id {
			return &j, nil
		}
	}
	return nil, nil
}

func (m *mockJobRepo) UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error {
	for i, j := range m.exportJobs {
		if j.ID == id {
			m.exportJobs[i].Status = status
			return nil
		}
	}
	return nil
}

func (m *mockJobRepo) GetPendingExportJobs(ctx context.Context) ([]system_domain.ExportJob, error) {
	return nil, nil
}

func (m *mockJobRepo) ClaimNextExportJob(ctx context.Context) (*system_domain.ExportJob, error) {
	return nil, nil
}

func (m *mockJobRepo) RecoverStuckExportJobs(ctx context.Context) (int, error) {
	return 0, nil
}

func TestJobService_GetImportJobs_Scoping(t *testing.T) {
	repo := &mockJobRepo{
		importJobs: []system_domain.ImportJob{
			{BaseEntity: kernel.BaseEntity{ID: 1}, UserID: 10, Status: "PENDING"},
			{BaseEntity: kernel.BaseEntity{ID: 2}, UserID: 20, Status: "COMPLETED"},
			{BaseEntity: kernel.BaseEntity{ID: 3}, UserID: 10, Status: "PROCESSING"},
		},
	}
	svc := usecase.NewJobService(repo)

	// User 10 requests only their jobs
	user10 := 10
	res, err := svc.GetImportJobs(context.Background(), 1, 50, &user10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Data) != 2 {
		t.Errorf("expected 2 jobs for user 10, got %d", len(res.Data))
	}

	// Request without user filter (all jobs)
	allRes, err := svc.GetImportJobs(context.Background(), 1, 50, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(allRes.Data) != 3 {
		t.Errorf("expected 3 total jobs, got %d", len(allRes.Data))
	}
}

func TestJobService_CancelImportJob_Authorization(t *testing.T) {
	repo := &mockJobRepo{
		importJobs: []system_domain.ImportJob{
			{BaseEntity: kernel.BaseEntity{ID: 1}, UserID: 10, Status: "PENDING"},
		},
	}
	svc := usecase.NewJobService(repo)

	// User 20 tries to cancel User 10's job -> should fail
	user20 := 20
	err := svc.CancelImportJob(context.Background(), 1, &user20)
	if err == nil {
		t.Fatal("expected unauthorized error when cancelling another user's job, got nil")
	}

	// User 10 cancels their own job -> should succeed
	user10 := 10
	err = svc.CancelImportJob(context.Background(), 1, &user10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.importJobs[0].Status != "CANCELLED" {
		t.Errorf("expected status CANCELLED, got %s", repo.importJobs[0].Status)
	}
}

