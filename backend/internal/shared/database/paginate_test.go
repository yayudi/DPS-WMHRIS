package database

import (
	"testing"
)

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

