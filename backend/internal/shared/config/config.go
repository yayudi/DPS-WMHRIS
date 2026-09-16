package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port      string
	Env       string
	DBDSN     string
	JWTSecret   string
	StoragePath string
}

var AppConfig Config

func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	AppConfig = Config{
		Port:      getEnv("PORT", "8080"),
		Env:       getEnv("ENV", "development"),
		DBDSN:     getEnv("DB_DSN", ""),
		JWTSecret:   getEnv("JWT_SECRET", "default_secret_key"),
		StoragePath: getEnv("STORAGE_PATH", "./storage"),
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
