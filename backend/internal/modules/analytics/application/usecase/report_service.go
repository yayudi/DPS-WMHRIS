package usecase

import (
	"context"
	"encoding/json"
	"fmt"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"

	analytics_mysql "github.com/dps-wmhris/backend/internal/modules/analytics/adapter/outbound/mysql"
)

type ReportService interface {
	GetReportFilters(ctx context.Context) (analytics_dto.ReportFilterResponse, error)
	GetUserExportJobs(ctx context.Context, userID int) ([]analytics_dto.UserExportJobResponse, error)
}

type reportServiceImpl struct {
	reportRepo analytics_mysql.ReportRepository
}

func NewReportService(reportRepo analytics_mysql.ReportRepository) ReportService {
	return &reportServiceImpl{reportRepo: reportRepo}
}

func (s *reportServiceImpl) GetReportFilters(ctx context.Context) (analytics_dto.ReportFilterResponse, error) {
	buildings, err := s.reportRepo.GetDistinctBuildings(ctx)
	if err != nil {
		return analytics_dto.ReportFilterResponse{}, err
	}

	if buildings == nil {
		buildings = []string{}
	}

	purposes, err := s.reportRepo.GetDistinctPurposes(ctx)
	if err != nil {
		return analytics_dto.ReportFilterResponse{}, err
	}

	if purposes == nil {
		purposes = []string{}
	}

	relations, err := s.reportRepo.GetBuildingPurposeRelations(ctx)
	if err != nil {
		return analytics_dto.ReportFilterResponse{}, err
	}

	buildingsByPurpose := make(map[string][]string)
	for _, row := range relations {
		purpose := row["purpose"].(string)
		building := row["building"].(string)

		if _, exists := buildingsByPurpose[purpose]; !exists {
			buildingsByPurpose[purpose] = []string{}
		}
		buildingsByPurpose[purpose] = append(buildingsByPurpose[purpose], building)
	}

	return analytics_dto.ReportFilterResponse{
		AllBuildings:       buildings,
		Purposes:           purposes,
		BuildingsByPurpose: buildingsByPurpose,
	}, nil
}

func (s *reportServiceImpl) GetUserExportJobs(ctx context.Context, userID int) ([]analytics_dto.UserExportJobResponse, error) {
	jobs, err := s.reportRepo.GetUserExportJobs(ctx, userID)
	if err != nil {
		return nil, err
	}

	var response []analytics_dto.UserExportJobResponse
	for _, job := range jobs {
		exportType := "STOCK_REPORT"
		if job.Filters != nil {
			var parsed map[string]interface{}
			if err := json.Unmarshal([]byte(*job.Filters), &parsed); err == nil {
				if t, ok := parsed["exportType"].(string); ok {
					exportType = t
				}
			}
		}

		// download_url mengarah ke endpoint presigned download API
		var downloadURL *string
		if job.Status == "COMPLETED" && job.FilePath != nil && *job.FilePath != "" {
			url := fmt.Sprintf("/api/exports/download/%d", job.ID)
			downloadURL = &url
		}

		response = append(response, analytics_dto.UserExportJobResponse{
			ID:           job.ID,
			Status:       job.Status,
			FilePath:     job.FilePath,
			ErrorMessage: job.ErrorMessage,
			CreatedAt:    job.CreatedAt,
			Filters:      job.Filters,
			Type:         exportType,
			DownloadURL:  downloadURL,
		})
	}

	if response == nil {
		response = []analytics_dto.UserExportJobResponse{}
	}

	return response, nil
}
