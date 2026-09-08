package main

import (
	"log"
	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/database"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load("../.env"); err != nil {
		godotenv.Load("../../.env")
	}
	config.LoadConfig()
	db := database.ConnectDB()
	defer db.Close()

	_, err := db.Exec("ALTER TABLE attendance_logs ADD COLUMN late_pardon_minutes INT DEFAULT 0;")
	if err != nil {
		log.Printf("Migration error (may already exist): %v\n", err)
	} else {
		log.Println("Migration successful: added late_pardon_minutes column.")
	}
}
