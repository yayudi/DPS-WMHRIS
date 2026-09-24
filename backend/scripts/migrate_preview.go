package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
)

type LegacyMovement struct {
	ID           int       `db:"id"`
	ProductID    int       `db:"product_id"`
	Quantity     int       `db:"quantity"`
	MovementType string    `db:"movement_type"`
	Notes        *string   `db:"notes"`
	CreatedAt    time.Time `db:"created_at"`
}

func main() {
	// Load .env relative to the scripts folder
	if err := godotenv.Load("../.env"); err != nil {
		log.Println("Warning: No .env file found in ../, attempting to load from current dir")
		godotenv.Load(".env")
	}

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatalln("Error: DB_DSN environment variable is not set")
	}

	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		log.Fatalln("Error connecting to database:", err)
	}
	defer db.Close()

	log.Println("Database connected. Fetching legacy stock_movements...")
	
	// Fetch legacy data
	var movements []LegacyMovement
	err = db.Select(&movements, "SELECT id, product_id, quantity, movement_type, notes, created_at FROM stock_movements ORDER BY id ASC")
	if err != nil {
		log.Fatalln("Error querying stock_movements:", err)
	}

	// Regex Parser 
	// Menangkap pola yang umum: "INV-123", "Order #567", "SO/2023/1", dsb.
re := regexp.MustCompile(`(?i)((?:inv|order|so|po|memo)[\s\:\-\#]*[a-zA-Z0-9\-\/]+)`)

	csvFileName := "migration_preview.csv"
	file, err := os.Create(csvFileName)
	if err != nil {
		log.Fatalln("Error creating CSV file:", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write CSV Header
	writer.Write([]string{"Movement_ID", "Created_At", "Movement_Type", "Product_ID", "Quantity", "Original_Notes", "Extracted_Reference_ID"})

	matchedCount := 0
	for _, m := range movements {
		refID := ""
		notesStr := ""
		if m.Notes != nil {
			notesStr = *m.Notes
		}

		matches := re.FindStringSubmatch(notesStr)
		
		if len(matches) > 1 {
			refID = matches[1] // The captured group
			matchedCount++
		} else {
			// Fallback: Jika Regex gagal menemukan nomor invoice
			refID = fmt.Sprintf("LEGACY-MOV-%d", m.ID)
		}

		writer.Write([]string{
			strconv.Itoa(m.ID),
			m.CreatedAt.Format("2006-01-02 15:04:05"),
			m.MovementType,
			strconv.Itoa(m.ProductID),
			strconv.Itoa(m.Quantity),
			notesStr,
			refID,
		})
	}

	fmt.Println("==================================================")
	fmt.Printf("Preview generation complete!\n")
	fmt.Printf("Total Records Processed      : %d\n", len(movements))
	fmt.Printf("Records with Extracted ID    : %d\n", matchedCount)
	fmt.Printf("Records using Fallback ID    : %d\n", len(movements)-matchedCount)
	fmt.Printf("Output File                  : %s\n", csvFileName)
	fmt.Println("==================================================")
	fmt.Println("Silakan inspeksi file CSV tersebut. Jika dirasa kolom Extracted_Reference_ID")
	fmt.Println("masih banyak yang salah tangkap, Anda bisa merevisi Regex-nya di script ini.")
}
