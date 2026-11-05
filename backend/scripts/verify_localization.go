//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load("../.env")
	dsn := strings.ReplaceAll(os.Getenv("DB_DSN"), "host.docker.internal", "127.0.0.1")
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		log.Fatalf("DB connect error: %v", err)
	}
	defer db.Close()

	var prefCount, userCount int
	if err := db.Get(&userCount, "SELECT COUNT(*) FROM users"); err != nil {
		log.Fatalf("Failed to count users: %v", err)
	}
	if err := db.Get(&prefCount, "SELECT COUNT(*) FROM user_preferences"); err != nil {
		log.Fatalf("Failed to count user_preferences: %v", err)
	}

	var locales []struct {
		Code      string `db:"code"`
		Name      string `db:"name"`
		Version   int    `db:"version"`
		IsDefault bool   `db:"is_default"`
	}
	if err := db.Select(&locales, "SELECT code, name, version, is_default FROM localization_locales"); err != nil {
		log.Fatalf("Failed to select locales: %v", err)
	}

	var transCount int
	if err := db.Get(&transCount, "SELECT COUNT(*) FROM localization_translations"); err != nil {
		log.Fatalf("Failed to count translations: %v", err)
	}

	var summary []struct {
		LocaleCode string `db:"locale_code"`
		Module     string `db:"module"`
		Count      int    `db:"count"`
	}
	query := `SELECT locale_code, module, COUNT(*) as count FROM localization_translations GROUP BY locale_code, module ORDER BY locale_code, module`
	if err := db.Select(&summary, query); err != nil {
		log.Fatalf("Failed to summarize translations: %v", err)
	}

	fmt.Println("=====================================================")
	fmt.Println("  VERIFICATION RESULT: PHASE 1 LOCALIZATION DB")
	fmt.Println("=====================================================")
	fmt.Printf("Users Table Count          : %d\n", userCount)
	fmt.Printf("User Preferences Count     : %d (1-to-1 Match: %t)\n", prefCount, userCount == prefCount)
	fmt.Println("Locales Registered         :")
	for _, l := range locales {
		fmt.Printf("  • %s (%s) - Version: %d | Default: %t\n", l.Code, l.Name, l.Version, l.IsDefault)
	}
	fmt.Printf("Total Translation Rows     : %d\n", transCount)
	fmt.Println("Breakdown by Module & Locale:")
	for _, s := range summary {
		fmt.Printf("  • [%-5s] %-10s : %d keys\n", s.LocaleCode, s.Module, s.Count)
	}
	fmt.Println("=====================================================")
}

