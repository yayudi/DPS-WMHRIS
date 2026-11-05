//go:build ignore

package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
)

func main() {
	log.Println("=====================================================")
	log.Println("  DPS-WMHRIS: Localization DDL Migration Runner")
	log.Println("=====================================================")

	// 1. Load Environment (.env)
	loadEnv()

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatalln("[ERROR] DB_DSN environment variable is not set.")
	}
	// Fallback host.docker.internal to 127.0.0.1 if running directly on host
	dsn = strings.ReplaceAll(dsn, "host.docker.internal", "127.0.0.1")

	// Ensure multiStatements=true is set in DSN if not already
	if !strings.Contains(dsn, "multiStatements=") {
		if strings.Contains(dsn, "?") {
			dsn += "&multiStatements=true"
		} else {
			dsn += "?multiStatements=true"
		}
	}

	// 2. Connect Database
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		log.Fatalf("[FATAL] DB connection error: %v\n", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("[FATAL] DB ping error: %v\n", err)
	}
	log.Println("[INFO] Successfully connected to MySQL.")

	// 3. Read SQL File
	sqlPath := resolveSQLPath("backend/scripts/migration_localization_i18n.sql")
	log.Printf("[INFO] Reading SQL migration from: %s\n", sqlPath)

	sqlBytes, err := os.ReadFile(sqlPath)
	if err != nil {
		log.Fatalf("[FATAL] Failed to read SQL file: %v\n", err)
	}

	// 4. Execute Migration
	log.Println("[INFO] Executing migration statements...")
	_, err = db.Exec(string(sqlBytes))
	if err != nil {
		log.Fatalf("[FATAL] Migration execution error: %v\n", err)
	}

	log.Println("[STATUS] SUCCESS - Localization tables and triggers migrated successfully.")
	log.Println("=====================================================")
}

func loadEnv() {
	paths := []string{".env", "../.env", "../../.env"}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			if err := godotenv.Load(p); err == nil {
				log.Printf("[INFO] Loaded environment configuration from: %s\n", p)
				return
			}
		}
	}
	log.Println("[WARN] No .env file found in standard search paths; relying on system environment.")
}

func resolveSQLPath(customPath string) string {
	candidates := []string{
		customPath,
		filepath.Base(customPath),
		filepath.Join("scripts", filepath.Base(customPath)),
		filepath.Join("..", "scripts", filepath.Base(customPath)),
		filepath.Join("backend", "scripts", filepath.Base(customPath)),
	}

	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
	}
	return customPath
}
