package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAndValidateConfig_Success(t *testing.T) {
	t.Setenv("PORT", "3010")
	t.Setenv("ENV", "production")
	t.Setenv("DB_DSN", "user:pass@tcp(127.0.0.1:3306)/db_wms_dev?parseTime=true")
	t.Setenv("JWT_SECRET", "strong-production-secret-key-2026")
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://wms.example.com , https://admin.example.com ")
	t.Setenv("RABBITMQ_PREFETCH_COUNT", "5")
	t.Setenv("KELJA_API_URL", "https://api.kelja.id/api/v1")
	t.Setenv("R2_PUBLIC_URL", "https://cdn.example.com/")
	t.Setenv("R2_BUCKET_NAME", "wms-bucket")
	t.Setenv("FIREBASE_CREDENTIALS_PATH", "/app/firebase/key.json")
	t.Setenv("FIREBASE_DB_URL", "https://wms.firebaseio.com")

	cfg, err := loadAndValidateConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if cfg.Port != "3010" || cfg.Env != "production" {
		t.Errorf("unexpected Port/Env: %s / %s", cfg.Port, cfg.Env)
	}
	if len(cfg.CORSAllowedOrigins) != 2 || cfg.CORSAllowedOrigins[0] != "https://wms.example.com" || cfg.CORSAllowedOrigins[1] != "https://admin.example.com" {
		t.Errorf("unexpected CORSAllowedOrigins: %+v", cfg.CORSAllowedOrigins)
	}
	if cfg.RabbitMQPrefetchCount != 5 {
		t.Errorf("expected RabbitMQPrefetchCount 5, got %d", cfg.RabbitMQPrefetchCount)
	}
	if cfg.KeljaApiURL != "https://api.kelja.id/api/v1" {
		t.Errorf("unexpected KeljaApiURL: %s", cfg.KeljaApiURL)
	}
	if cfg.R2PublicURL != "https://cdn.example.com" {
		t.Errorf("expected trailing slash trimmed from R2PublicURL, got %s", cfg.R2PublicURL)
	}
	if cfg.R2BucketName != "wms-bucket" {
		t.Errorf("unexpected R2BucketName: %s", cfg.R2BucketName)
	}
}

func TestLoadAndValidateConfig_MissingOrInsecureSecrets(t *testing.T) {
	t.Run("fails when DB_DSN is empty", func(t *testing.T) {
		t.Setenv("DB_DSN", "")
		t.Setenv("JWT_SECRET", "valid-secret")

		if _, err := loadAndValidateConfig(); err == nil {
			t.Fatal("expected error when DB_DSN is missing, got nil")
		}
	})

	t.Run("fails when JWT_SECRET is empty", func(t *testing.T) {
		t.Setenv("DB_DSN", "user:pass@tcp(127.0.0.1:3306)/db_wms_dev")
		t.Setenv("JWT_SECRET", "")

		if _, err := loadAndValidateConfig(); err == nil {
			t.Fatal("expected error when JWT_SECRET is empty, got nil")
		}
	})

	t.Run("fails when JWT_SECRET uses insecure default placeholder", func(t *testing.T) {
		t.Setenv("DB_DSN", "user:pass@tcp(127.0.0.1:3306)/db_wms_dev")
		t.Setenv("JWT_SECRET", insecureDefaultJWTSecret)

		if _, err := loadAndValidateConfig(); err == nil {
			t.Fatal("expected error when JWT_SECRET uses default_secret_key, got nil")
		}
	})

	t.Run("does not hardcode fallback KeljaApiURL when env is unset", func(t *testing.T) {
		t.Setenv("DB_DSN", "user:pass@tcp(127.0.0.1:3306)/db_wms_dev")
		t.Setenv("JWT_SECRET", "valid-secret")
		t.Setenv("KELJA_API_URL", "")

		cfg, err := loadAndValidateConfig()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.KeljaApiURL != "" {
			t.Errorf("expected empty KeljaApiURL when unset, got %q", cfg.KeljaApiURL)
		}
	})
}

func TestGetEnvAsIntAndParseCSVEnv(t *testing.T) {
	t.Setenv("TEST_INT_INVALID", "not-a-number")
	if got := getEnvAsInt("TEST_INT_INVALID", 42); got != 42 {
		t.Errorf("expected fallback 42 for invalid int, got %d", got)
	}

	t.Setenv("TEST_CSV_EMPTY", " , , ")
	if got := parseCSVEnv("TEST_CSV_EMPTY"); len(got) != 0 {
		t.Errorf("expected empty slice for blank CSV entries, got %+v", got)
	}
}

func TestResolveConfigFilePath(t *testing.T) {
	if got := resolveConfigFilePath(""); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}

	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "firebase_key.json")
	if err := os.WriteFile(tmpFile, []byte("{}"), 0600); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}

	if got := resolveConfigFilePath(tmpFile); got != tmpFile {
		t.Errorf("expected %q, got %q", tmpFile, got)
	}
}
