package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

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
}

// AppConfig stores the active loaded application configuration singleton.
var AppConfig Config

// LoadConfig loads environment variables from .env (if present) and populates AppConfig.
func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	AppConfig = Config{
		Port:                    getEnv("PORT", "8080"),
		Env:                     getEnv("ENV", "development"),
		DBDSN:                   getEnv("DB_DSN", ""),
		JWTSecret:               getEnv("JWT_SECRET", "default_secret_key"),
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
		KeljaApiURL:             getEnv("KELJA_API_URL", "https://dev-api.kelja.id/api/v1"),
		KeljaApiUsername:        getEnv("KELJA_API_USERNAME", ""),
		KeljaApiPass:            getEnv("KELJA_API_PASSWORD", ""),
		KeljaInternalAPIKey:     getEnv("KELJA_INTERNAL_API_KEY", ""),
	}

	if AppConfig.DBDSN == "" {
		log.Fatal("DB_DSN environment variable is required")
	}
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
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}
