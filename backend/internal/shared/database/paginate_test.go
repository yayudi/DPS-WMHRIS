package database

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/jmoiron/sqlx"
)

type stubExtContext struct {
	getFunc    func(ctx context.Context, dest any, query string, args ...any) error
	selectFunc func(ctx context.Context, dest any, query string, args ...any) error
	execFunc   func(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (s *stubExtContext) DriverName() string { return "mysql" }
func (s *stubExtContext) Rebind(q string) string {
	return q
}
func (s *stubExtContext) BindNamed(q string, arg any) (string, []any, error) {
	return q, nil, nil
}
func (s *stubExtContext) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return nil, nil
}
func (s *stubExtContext) QueryxContext(ctx context.Context, query string, args ...any) (*sqlx.Rows, error) {
	return nil, nil
}
func (s *stubExtContext) QueryRowxContext(ctx context.Context, query string, args ...any) *sqlx.Row {
	return nil
}
func (s *stubExtContext) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if s.execFunc != nil {
		return s.execFunc(ctx, query, args...)
	}
	return nil, nil
}
func (s *stubExtContext) SelectContext(ctx context.Context, dest any, query string, args ...any) error {
	if s.selectFunc != nil {
		return s.selectFunc(ctx, dest, query, args...)
	}
	return nil
}
func (s *stubExtContext) GetContext(ctx context.Context, dest any, query string, args ...any) error {
	if s.getFunc != nil {
		return s.getFunc(ctx, dest, query, args...)
	}
	return nil
}
func (s *stubExtContext) NamedExecContext(ctx context.Context, query string, arg any) (sql.Result, error) {
	return nil, nil
}

func TestStripOrderByForCount(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple order by desc",
			input:    "SELECT * FROM import_jobs ORDER BY created_at DESC",
			expected: "SELECT * FROM import_jobs",
		},
		{
			name:     "order by with table prefix and multiple columns",
			input:    "SELECT id, name FROM users ORDER BY users.created_at DESC, id ASC",
			expected: "SELECT id, name FROM users",
		},
		{
			name:     "no order by",
			input:    "SELECT * FROM import_jobs WHERE user_id = ?",
			expected: "SELECT * FROM import_jobs WHERE user_id = ?",
		},
		{
			name:     "subquery with inner and outer order by",
			input:    "SELECT * FROM (SELECT id FROM t ORDER BY id ASC) AS sub ORDER BY sub.id DESC",
			expected: "SELECT * FROM (SELECT id FROM t ORDER BY id ASC) AS sub",
		},
		{
			name:     "trailing whitespace",
			input:    "SELECT * FROM import_jobs ORDER BY id DESC   ",
			expected: "SELECT * FROM import_jobs",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StripOrderByForCount(tt.input)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestFetchPaginated_DoesNotMutateCallerArgsSlice(t *testing.T) {
	type rowItem struct {
		ID int `db:"id"`
	}

	// Create a slice with extra capacity to detect backing-array overwrite bugs
	backing := make([]any, 1, 5)
	backing[0] = "ACTIVE"
	fullView := backing[:3]
	fullView[1] = "SENTINEL_1"
	fullView[2] = "SENTINEL_2"
	callerArgs := backing[:1]

	var capturedFetchArgs []any
	mockExt := &stubExtContext{
		getFunc: func(ctx context.Context, dest any, query string, args ...any) error {
			if ptr, ok := dest.(*int); ok {
				*ptr = 25
			}
			return nil
		},
		selectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
			capturedFetchArgs = append([]any(nil), args...)
			if ptr, ok := dest.(*[]rowItem); ok {
				*ptr = []rowItem{{ID: 1}, {ID: 2}}
			}
			return nil
		},
	}

	ctx := context.WithValue(context.Background(), txKey{}, ExtContext(mockExt))
	res, err := FetchPaginated[rowItem](ctx, nil, "SELECT id FROM items WHERE status = ? ORDER BY id DESC", 2, 10, callerArgs...)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Total != 25 || res.TotalPages != 3 || res.Page != 2 || res.Limit != 10 || len(res.Data) != 2 {
		t.Errorf("unexpected pagination metadata: %+v", res)
	}
	if fullView[1] != "SENTINEL_1" || fullView[2] != "SENTINEL_2" {
		t.Fatalf("FetchPaginated mutated caller's backing array! got [%v, %v]", fullView[1], fullView[2])
	}
	expectedFetchArgs := []any{"ACTIVE", 10, 10}
	if !reflect.DeepEqual(capturedFetchArgs, expectedFetchArgs) {
		t.Errorf("expected fetch args %v, got %v", expectedFetchArgs, capturedFetchArgs)
	}
}
