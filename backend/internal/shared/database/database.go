package database

import (
	"log"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

func ConnectDB() *sqlx.DB {
	db, err := sqlx.Connect("mysql", config.AppConfig.DBDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Pengaturan pool koneksi untuk server lokal
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("Database is not responding: %v", err)
	}

	log.Println("Connected to MySQL database successfully!")
	return db
}
