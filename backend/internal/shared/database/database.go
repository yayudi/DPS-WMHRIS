// Package database provides MySQL connection management, context-propagated transactions, pagination, and generic repository helpers.
package database

import (
	"log"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
)

// ConnectDB establishes and verifies a pooled MySQL connection using config.AppConfig.DBDSN.
func ConnectDB() *sqlx.DB {
	db, err := sqlx.Connect("mysql", config.AppConfig.DBDSN)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("Database is not responding: %v", err)
	}

	log.Println("Connected to MySQL database successfully!")
	return db
}
