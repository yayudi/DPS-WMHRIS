package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load(".env")

	// 1. Connect DB
	db, err := sqlx.Connect("mysql", os.Getenv("DB_DSN"))
	if err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}
	defer db.Close()

	// 2. Login to Kelja
	loginBody := []byte(`{"username":"` + os.Getenv("KELJA_USERNAME") + `","password":"` + os.Getenv("KELJA_PASSWORD") + `"}`)
	resp, err := http.Post(os.Getenv("KELJA_BASE_URL")+"/auth/login", "application/json", bytes.NewBuffer(loginBody))
	// Wait, I can't import bytes, I'll use strings.NewReader
}
