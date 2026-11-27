package domain_test

import (
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/system/domain"
)

func TestDuplicateMediaErrorAndJobStatusConstants(t *testing.T) {
	err := domain.DuplicateMediaError{DuplicateOf: 42}
	if err.Error() != "Duplicate media of 42" {
		t.Fatalf("unexpected error string: %s", err.Error())
	}
	if domain.JobStatusPending != "PENDING" || domain.JobStatusProcessing != "PROCESSING" || domain.JobStatusCancelled != "CANCELLED" {
		t.Fatalf("unexpected job status constants")
	}
}
