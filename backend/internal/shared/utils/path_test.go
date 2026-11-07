package utils

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

func TestResolveStoragePath(t *testing.T) {
	// Create temporary directory to simulate storage
	tempDir, err := os.MkdirTemp("", "test_storage_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create a test file inside tempDir/uploads/attendance
	testSubdir := filepath.Join(tempDir, "uploads", "attendance")
	if err := os.MkdirAll(testSubdir, 0755); err != nil {
		t.Fatalf("failed to create test subdir: %v", err)
	}
	testFilePath := filepath.Join(testSubdir, "test.csv")
	if err := os.WriteFile(testFilePath, []byte("dummy data"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// Set StoragePath in config
	origStoragePath := config.AppConfig.StoragePath
	config.AppConfig.StoragePath = tempDir
	defer func() {
		config.AppConfig.StoragePath = origStoragePath
	}()

	t.Run("empty path", func(t *testing.T) {
		res := ResolveStoragePath("")
		if res != "" {
			t.Errorf("expected empty string, got %s", res)
		}
	})

	t.Run("absolute existing path", func(t *testing.T) {
		res := ResolveStoragePath(testFilePath)
		if res != testFilePath {
			t.Errorf("expected %s, got %s", testFilePath, res)
		}
	})

	t.Run("relative path with storage/ prefix resolved via StoragePath", func(t *testing.T) {
		relPath := filepath.Join("storage", "uploads", "attendance", "test.csv")
		res := ResolveStoragePath(relPath)
		if res != testFilePath {
			t.Errorf("expected %s, got %s", testFilePath, res)
		}
	})

	t.Run("relative path without storage/ prefix resolved via StoragePath", func(t *testing.T) {
		relPath := filepath.Join("uploads", "attendance", "test.csv")
		res := ResolveStoragePath(relPath)
		if res != testFilePath {
			t.Errorf("expected %s, got %s", testFilePath, res)
		}
	})

	t.Run("non-existent path returns cleaned original", func(t *testing.T) {
		nonExistent := filepath.Join("some", "missing", "file.csv")
		res := ResolveStoragePath(nonExistent)
		if res != nonExistent {
			t.Errorf("expected %s, got %s", nonExistent, res)
		}
	})
}

