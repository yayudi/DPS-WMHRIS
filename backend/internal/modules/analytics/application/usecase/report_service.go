package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
)

// ReportService is a compatibility alias for analytics/port.ReportService.
type ReportService = analytics_port.ReportService

type reportServiceImpl struct {
	reportRepo analytics_port.ReportRepository
}

// NewReportService creates a ReportService backed by ReportRepository.
func NewReportService(reportRepo analytics_port.ReportRepository) analytics_port.ReportService {
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
		purpose, okP := row["purpose"].(string)
		building, okB := row["building"].(string)
		if !okP || !okB || purpose == "" || building == "" {
			continue
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

	response := make([]analytics_dto.UserExportJobResponse, 0, len(jobs))
	for _, job := range jobs {
		exportType := strings.TrimSpace(job.JobType)
		if exportType == "" && job.Filters != nil {
			var parsed map[string]any
			if err := json.Unmarshal([]byte(*job.Filters), &parsed); err == nil {
				if t, ok := parsed["exportType"].(string); ok && t != "" {
					exportType = t
				}
			}
		}
		if exportType == "" {
			exportType = "STOCK_REPORT"
		}

		// download_url points to the authenticated presigned-redirect download endpoint
		var downloadURL *string
		if job.Status == "COMPLETED" && job.FilePath != nil && *job.FilePath != "" {
			url := fmt.Sprintf("/api/exports/download/%d", job.ID)
			downloadURL = &url
		}

		createdAt := job.CreatedAt
		response = append(response, analytics_dto.UserExportJobResponse{
			ID:           job.ID,
			Status:       job.Status,
			FilePath:     job.FilePath,
			ErrorMessage: job.ErrorMessage,
			CreatedAt:    &createdAt,
			Filters:      job.Filters,
			JobType:      exportType,
			Type:         exportType,
			DownloadURL:  downloadURL,
		})
	}

	return response, nil
}
