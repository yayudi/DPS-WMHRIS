package database

import (
	"errors"
	"fmt"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func TestIsDuplicateKey(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "Nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "Generic error",
			err:      errors.New("syntax error"),
			expected: false,
		},
		{
			name:     "MySQL 1062 Duplicate Key",
			err:      &mysql.MySQLError{Number: 1062, Message: "Duplicate entry"},
			expected: true,
		},
		{
			name:     "Wrapped MySQL 1062",
			err:      fmt.Errorf("db insert failed: %w", &mysql.MySQLError{Number: 1062, Message: "Duplicate entry"}),
			expected: true,
		},
		{
			name:     "MySQL Other Error (e.g. 1045)",
			err:      &mysql.MySQLError{Number: 1045, Message: "Access denied"},
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsDuplicateKey(tc.err); got != tc.expected {
				t.Errorf("IsDuplicateKey() = %v, expected %v", got, tc.expected)
			}
		})
	}
}

func TestIsForeignKeyViolation(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "Nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "MySQL 1452 FK Violation",
			err:      &mysql.MySQLError{Number: 1452, Message: "Cannot add or update a child row"},
			expected: true,
		},
		{
			name:     "Wrapped MySQL 1452",
			err:      fmt.Errorf("execute error: %w", &mysql.MySQLError{Number: 1452}),
			expected: true,
		},
		{
			name:     "MySQL Other Error",
			err:      &mysql.MySQLError{Number: 1062},
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsForeignKeyViolation(tc.err); got != tc.expected {
				t.Errorf("IsForeignKeyViolation() = %v, expected %v", got, tc.expected)
			}
		})
	}
}

