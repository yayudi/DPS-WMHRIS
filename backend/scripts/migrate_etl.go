package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"regexp"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
)

type LegacyMovement struct {
	ID             int       `db:"id"`
	ProductID      int       `db:"product_id"`
	Quantity       int       `db:"quantity"`
	FromLocationID *int      `db:"from_location_id"`
	ToLocationID   *int      `db:"to_location_id"`
	MovementType   string    `db:"movement_type"`
	Notes          *string   `db:"notes"`
	UserID         int       `db:"user_id"`
	CreatedAt      time.Time `db:"created_at"`
}

type GroupedTransaction struct {
	ReferenceID   string
	CreatedAt     time.Time
	UserID        int
	Movements     []LegacyMovement
}

func main() {
	// ==========================================
	// CONFIGURATION
	// ==========================================
	DRY_RUN := false // Set to false to actually insert data into the DB
	// ==========================================

	if err := godotenv.Load("../.env"); err != nil {
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

	var movements []LegacyMovement
	err = db.Select(&movements, "SELECT id, product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes, created_at FROM stock_movements ORDER BY id ASC")
	if err != nil {
		log.Fatalln("Error querying stock_movements:", err)
	}

	re := regexp.MustCompile(`(?i)((?:inv|order|so|po|memo)[\s\:\-\#]*[a-zA-Z0-9\-\/]+)`)

	// 1. Grouping Phase (Transform)
	log.Println("Grouping transactions based on Extracted Reference ID and Date...")
	groups := make(map[string]*GroupedTransaction)

	for _, m := range movements {
		refID := ""
		notesStr := ""
		if m.Notes != nil {
			notesStr = *m.Notes
		}

		matches := re.FindStringSubmatch(notesStr)
		if len(matches) > 1 {
			refID = matches[1]
		} else if notesStr != "" {
			// Use the raw note if regex fails, limiting length just in case
			refID = notesStr
			if len(refID) > 80 {
				refID = refID[:80]
			}
		} else {
			refID = fmt.Sprintf("LEGACY-MOV-%d", m.ID)
		}

		// Group by ReferenceID AND Date (to avoid grouping same invoice from different years if any)
		dateKey := m.CreatedAt.Format("2006-01-02")
		groupKey := fmt.Sprintf("%s|%s", refID, dateKey)

		if _, exists := groups[groupKey]; !exists {
			groups[groupKey] = &GroupedTransaction{
				ReferenceID: refID,
				CreatedAt:   m.CreatedAt,
				UserID:      m.UserID,
				Movements:   []LegacyMovement{},
			}
		}
		groups[groupKey].Movements = append(groups[groupKey].Movements, m)
	}

	log.Printf("Transform Result: Grouped %d legacy movements into %d unique 3-Tier Headers.\n", len(movements), len(groups))

	if DRY_RUN {
		log.Println("==================================================")
		log.Println("DRY RUN MODE ENABLED. No data will be inserted.")
		log.Println("==================================================")
		
		// Simulate counting and Generate 3 CSV Previews
		fileTx, _ := os.Create("preview_inv_transactions.csv")
		fileMov, _ := os.Create("preview_inv_movements.csv")
		fileLines, _ := os.Create("preview_inv_movement_lines.csv")

		writerTx := csv.NewWriter(fileTx)
		writerMov := csv.NewWriter(fileMov)
		writerLines := csv.NewWriter(fileLines)

		writerTx.Write([]string{"Transaction_Number", "Reference_Type", "Reference_ID", "Status", "Created_At"})
		writerMov.Write([]string{"Transaction_Number", "Product_ID", "Target_Quantity", "Status", "Created_At"})
		writerLines.Write([]string{"Transaction_Number", "Product_ID", "Scanned_Location_ID", "Qty_Done", "Created_At"})

		totalDemands := 0
		totalLines := 0
		headerCount := 0

		for _, g := range groups {
			headerCount++
			trxNo := fmt.Sprintf("TRX-LGCY-SIM-%d", headerCount)
			
			// 1. Write Header (inv_transactions)
			writerTx.Write([]string{
				trxNo, fmt.Sprintf("LEGACY_%s", g.Movements[0].MovementType), g.ReferenceID, "COMPLETED", g.CreatedAt.Format("2006-01-02 15:04:05"),
			})

			for _, m := range g.Movements {
				totalDemands++
				totalLines++
				
				// 2. Write Demand (inv_movements)
				writerMov.Write([]string{
					trxNo, fmt.Sprintf("%d", m.ProductID), fmt.Sprintf("%d", m.Quantity), "COMPLETED", m.CreatedAt.Format("2006-01-02 15:04:05"),
				})

				// Determine valid location ID
				locID := 0
				if m.FromLocationID != nil {
					locID = *m.FromLocationID
				} else if m.ToLocationID != nil {
					locID = *m.ToLocationID
				}

				// 3. Write Line (inv_movement_lines)
				writerLines.Write([]string{
					trxNo, fmt.Sprintf("%d", m.ProductID), fmt.Sprintf("%d", locID), fmt.Sprintf("%d", m.Quantity), m.CreatedAt.Format("2006-01-02 15:04:05"),
				})
			}
		}

		writerTx.Flush()
		writerMov.Flush()
		writerLines.Flush()
		
		fileTx.Close()
		fileMov.Close()
		fileLines.Close()

		log.Printf("Exported 3 CSV previews:\n 1. preview_inv_transactions.csv\n 2. preview_inv_movements.csv\n 3. preview_inv_movement_lines.csv\n")


		log.Printf("[SIMULATED INSERTION PLAN]")
		log.Printf(" -> inv_transactions   : %d rows (Headers)", len(groups))
		log.Printf(" -> inv_movements      : %d rows (Demands)", totalDemands)
		log.Printf(" -> inv_movement_lines : %d rows (Executions)", totalLines)
		log.Println("")
		log.Println("To perform the actual migration, change 'DRY_RUN := false' inside migrate_etl.go")
		return
	}

	// 2. Insert Phase (Actual ETL - Load)
	log.Println("Starting Database Transaction for ETL...")
	tx, err := db.Beginx()
	if err != nil {
		log.Fatalln("Failed to begin tx:", err)
	}

	headerCount := 0
	for _, group := range groups {
		// Generate standard format for Transaction Number
		trxNo := fmt.Sprintf("TRX-LGCY-%d-%d", time.Now().UnixMilli(), headerCount) 
		
		// Insert Header (inv_transactions)
		res, err := tx.Exec(`
			INSERT INTO inv_transactions (transaction_number, reference_type, reference_id, assigned_building, status, created_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, trxNo, fmt.Sprintf("LEGACY_%s", group.Movements[0].MovementType), group.ReferenceID, "LEGACY_BUILDING", "COMPLETED", group.UserID, group.CreatedAt, group.CreatedAt)
		
		if err != nil {
			tx.Rollback()
			log.Fatalln("Failed inserting header for ref:", group.ReferenceID, err)
		}
		
		headerID, _ := res.LastInsertId()
		headerCount++

		for _, m := range group.Movements {
			// Insert Demand (inv_movements)
			resDemand, err := tx.Exec(`
				INSERT INTO inv_movements (transaction_id, product_id, target_quantity, status, created_at)
				VALUES (?, ?, ?, ?, ?)
			`, headerID, m.ProductID, m.Quantity, "COMPLETED", m.CreatedAt)
			if err != nil {
				tx.Rollback()
				log.Fatalln("Failed inserting demand:", err)
			}
			
			demandID, _ := resDemand.LastInsertId()

			// Determine valid location ID
			locID := 0
			if m.FromLocationID != nil {
				locID = *m.FromLocationID
			} else if m.ToLocationID != nil {
				locID = *m.ToLocationID
			}

			// Insert Execution Line (inv_movement_lines)
			_, err = tx.Exec(`
				INSERT INTO inv_movement_lines (movement_id, scanned_location_id, qty_done, scanned_by, created_at)
				VALUES (?, ?, ?, ?, ?)
			`, demandID, locID, m.Quantity, m.UserID, m.CreatedAt) 
			
			if err != nil {
				tx.Rollback()
				log.Fatalln("Failed inserting line:", err)
			}
		}
	}

	// Commit everything
	if err := tx.Commit(); err != nil {
		log.Fatalln("Failed to commit transaction:", err)
	}

	log.Printf("ETL Migration Complete! Successfully migrated into %d 3-Tier Transactions.\n", headerCount)
}
