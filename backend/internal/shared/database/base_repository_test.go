package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

type sampleActiveOnlyEntity struct {
	BaseEntity
	Code     string `db:"code,omitempty"`
	IsActive bool   `db:"is_active"`
	Ignored  string `db:"-"`
}

func TestNewBaseRepository_ValidationAndQueries(t *testing.T) {
	t.Run("panics on invalid SQL table identifier", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic for invalid table identifier")
			}
		}()
		_ = NewBaseRepository[sampleActiveOnlyEntity](nil, "users; DROP TABLE users;--")
	})

	t.Run("FindByID applies is_active filter when entity has is_active without deleted_at", func(t *testing.T) {
		repo := NewBaseRepository[sampleActiveOnlyEntity](nil, "users")

		var capturedQuery string
		mockExt := &stubExtContext{
			getFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				capturedQuery = query
				return nil
			},
		}

		ctx := context.WithValue(context.Background(), txKey{}, ExtContext(mockExt))
		_, err := repo.FindByID(ctx, 42)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.Contains(capturedQuery, "is_active = ?") {
			t.Errorf("expected FindByID query to filter by is_active, got: %s", capturedQuery)
		}
		if !strings.Contains(capturedQuery, "code") || strings.Contains(capturedQuery, "omitempty") {
			t.Errorf("expected comma option stripped from db tag 'code,omitempty', got query: %s", capturedQuery)
		}
	})

	t.Run("SoftDelete and Restore generate expected statements", func(t *testing.T) {
		repo := NewBaseRepository[sampleActiveOnlyEntity](nil, "users")

		var executedQueries []string
		mockExt := &stubExtContext{
			execFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQueries = append(executedQueries, query)
				return nil, nil
			},
		}

		ctx := context.WithValue(context.Background(), txKey{}, ExtContext(mockExt))
		if err := repo.SoftDelete(ctx, 7); err != nil {
			t.Fatalf("SoftDelete failed: %v", err)
		}
		if err := repo.Restore(ctx, 7); err != nil {
			t.Fatalf("Restore failed: %v", err)
		}

		if len(executedQueries) != 2 {
			t.Fatalf("expected 2 executed queries, got %d", len(executedQueries))
		}
		if executedQueries[0] != "UPDATE users SET is_active = 0 WHERE id = ?" {
			t.Errorf("unexpected SoftDelete query: %s", executedQueries[0])
		}
		if executedQueries[1] != "UPDATE users SET is_active = 1 WHERE id = ?" {
			t.Errorf("unexpected Restore query: %s", executedQueries[1])
		}
	})
}
