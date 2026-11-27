// Package config manages environment-driven configuration and external client initialization (Cloudflare R2, Firebase).
package config

import (
	"errors"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const insecureDefaultJWTSecret = "default_secret_key"

// Config holds application-wide environment configuration loaded at startup.
type Config struct {
	Port                    string
	Env                     string
	DBDSN                   string
	JWTSecret               string
	StoragePath             string
	CORSAllowedOrigins      []string
	RabbitMQURL             string
	RabbitMQQueueName       string
	RabbitMQExchangeName    string
	RabbitMQExchangeType    string
	RabbitMQPrefetchCount   int
	RabbitMQPrefetchSize    int
	RabbitMQDLXExchangeName string
	RabbitMQDLQName         string
	KeljaApiURL             string
	KeljaApiUsername        string
	KeljaApiPass            string
	KeljaInternalAPIKey     string
	R2Endpoint              string
	R2AccessKeyID           string
	R2SecretAccessKey       string
	R2BucketName            string
	R2PublicURL             string
	FirebaseCredentialsPath string
	FirebaseDBURL           string
}

// AppConfig stores the active loaded application configuration singleton.
var AppConfig Config

// LoadConfig loads environment variables from .env (if present), validates mandatory secrets, and populates AppConfig.
func LoadConfig() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	cfg, err := loadAndValidateConfig()
	if err != nil {
		log.Fatal(err)
	}
	AppConfig = cfg
}

func loadAndValidateConfig() (Config, error) {
	cfg := Config{
		Port:                    getEnv("PORT", "8080"),
		Env:                     getEnv("ENV", "development"),
		DBDSN:                   strings.TrimSpace(getEnv("DB_DSN", "")),
		JWTSecret:               strings.TrimSpace(getEnv("JWT_SECRET", "")),
		StoragePath:             getEnv("STORAGE_PATH", "./storage"),
		CORSAllowedOrigins:      parseCSVEnv("CORS_ALLOWED_ORIGINS"),
		RabbitMQURL:             getEnv("RABBITMQ_URL", ""),
		RabbitMQQueueName:       getEnv("RABBITMQ_QUEUE_NAME", "queue.wmhris.core"),
		RabbitMQExchangeName:    getEnv("RABBITMQ_EXCHANGE_NAME", "dps.wmhris.events"),
		RabbitMQExchangeType:    getEnv("RABBITMQ_EXCHANGE_TYPE", "topic"),
		RabbitMQPrefetchCount:   getEnvAsInt("RABBITMQ_PREFETCH_COUNT", 3),
		RabbitMQPrefetchSize:    getEnvAsInt("RABBITMQ_PREFETCH_SIZE", 0),
		RabbitMQDLXExchangeName: getEnv("RABBITMQ_DLX_EXCHANGE_NAME", "dps.wmhris.dlx"),
		RabbitMQDLQName:         getEnv("RABBITMQ_DLQ_NAME", "queue.wmhris.core.dlq"),
		KeljaApiURL:             strings.TrimSpace(getEnv("KELJA_API_URL", "")),
		KeljaApiUsername:        getEnv("KELJA_API_USERNAME", ""),
		KeljaApiPass:            getEnv("KELJA_API_PASSWORD", ""),
		KeljaInternalAPIKey:     getEnv("KELJA_INTERNAL_API_KEY", ""),
		R2Endpoint:              strings.TrimSpace(getEnv("R2_ENDPOINT", "")),
		R2AccessKeyID:           strings.TrimSpace(getEnv("R2_ACCESS_KEY_ID", "")),
		R2SecretAccessKey:       strings.TrimSpace(getEnv("R2_SECRET_ACCESS_KEY", "")),
		R2BucketName:            strings.TrimSpace(getEnv("R2_BUCKET_NAME", "")),
		R2PublicURL:             strings.TrimRight(strings.TrimSpace(getEnv("R2_PUBLIC_URL", "")), "/"),
		FirebaseCredentialsPath: strings.TrimSpace(getEnv("FIREBASE_CREDENTIALS_PATH", "")),
		FirebaseDBURL:           strings.TrimSpace(getEnv("FIREBASE_DB_URL", "")),
	}

	if cfg.DBDSN == "" {
		return Config{}, errors.New("DB_DSN environment variable is required")
	}

	if cfg.JWTSecret == "" || cfg.JWTSecret == insecureDefaultJWTSecret {
		return Config{}, errors.New("JWT_SECRET environment variable is required and must not use the insecure default placeholder")
	}

	return cfg, nil
}

func parseCSVEnv(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	if value, exists := os.LookupEnv(key); exists {
		if i, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
			return i
		}
	}
	return fallback
}
