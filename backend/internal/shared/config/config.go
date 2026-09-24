package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	Env            string
	DBDSN          string
	JWTSecret      string
	StoragePath    string
	RabbitMQURL    string
	KeljaApiURL    string
	KeljaApiUsername  string
	KeljaApiPass   string
}

var AppConfig Config

func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	AppConfig = Config{
		Port:           getEnv("PORT", "8080"),
		Env:            getEnv("ENV", "development"),
		DBDSN:          getEnv("DB_DSN", ""),
		JWTSecret:      getEnv("JWT_SECRET", "default_secret_key"),
		StoragePath:    getEnv("STORAGE_PATH", "./storage"),
		RabbitMQURL:    getEnv("RABBITMQ_URL", ""),
		KeljaApiURL:    getEnv("KELJA_API_URL", "https://dev-api.kelja.id/api/v1"),
		KeljaApiUsername:  getEnv("KELJA_API_USERNAME", ""),
		KeljaApiPass:   getEnv("KELJA_API_PASSWORD", ""),
	}

	if AppConfig.DBDSN == "" {
		log.Fatal("DB_DSN environment variable is required")
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
