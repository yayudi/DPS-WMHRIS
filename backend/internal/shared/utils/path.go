package utils

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

// ResolveStoragePath menstandarisasi dan menyelesaikan path file penyimpanan (storage),
// memastikan file dapat ditemukan baik saat dijalankan di container Docker (/app), CLI worker, maupun root lokal.
func ResolveStoragePath(path string) string {
	if path == "" {
		return ""
	}

	cleanPath := filepath.Clean(path)

	// 1. Cek langsung jika path sudah ada (misal path absolut atau relatif valid terhadap CWD)
	if _, err := os.Stat(cleanPath); err == nil {
		return cleanPath
	}

	// 2. Jika path relatif terhadap StoragePath yang dikonfigurasi
	storageBase := config.AppConfig.StoragePath
	if storageBase != "" {
		// Cek jika path diawali prefix "storage/" atau "./storage/"
		normalized := filepath.ToSlash(cleanPath)
		trimmed := strings.TrimPrefix(normalized, "./")
		trimmed = strings.TrimPrefix(trimmed, "storage/")

		candidate := filepath.Join(storageBase, filepath.FromSlash(trimmed))
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}

		// Coba gabungkan langsung
		candidate2 := filepath.Join(storageBase, cleanPath)
		if _, err := os.Stat(candidate2); err == nil {
			return candidate2
		}
	}

	// 3. Fallback: Cek relatif terhadap direktori executable biner
	if execPath, err := os.Executable(); err == nil {
		baseDir := filepath.Dir(execPath)
		candidate := filepath.Join(baseDir, cleanPath)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	return cleanPath
}

