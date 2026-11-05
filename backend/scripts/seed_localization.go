//go:build ignore

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	_ "github.com/go-sql-driver/mysql"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
)

type SeedEntry struct {
	Module       string            `json:"module"`
	Key          string            `json:"key"`
	Translations map[string]string `json:"translations"`
}

func main() {
	checkOnly := flag.Bool("check", false, "Audit parity and scan codebase for missing translation keys without modifying database")
	dryRun := flag.Bool("dry-run", false, "Simulate execution without modifying the database")
	targetLocale := flag.String("locale", "", "Sync only specific locale (e.g. id-ID or en-US)")
	seedFile := flag.String("file", "", "Custom path to translations JSON seed file")
	flag.Parse()

	log.Println("=====================================================")
	log.Println("  DPS-WMHRIS: Localization Seeder & Synchronizer (DX)")
	log.Println("=====================================================")
	if *dryRun {
		log.Println("[MODE] DRY RUN ACTIVE - No database changes will be applied.")
	}

	// 1. Resolve JSON Seed File Path
	resolvedSeedPath := resolveSeedPath(*seedFile)
	log.Printf("[INFO] Loading seed data from: %s\n", resolvedSeedPath)

	seedDataRaw, err := os.ReadFile(resolvedSeedPath)
	if err != nil {
		log.Fatalf("[FATAL] Failed to read seed file: %v\n", err)
	}

	var entries []SeedEntry
	if err := json.Unmarshal(seedDataRaw, &entries); err != nil {
		log.Fatalf("[FATAL] Failed to parse seed JSON: %v\n", err)
	}
	log.Printf("[INFO] Loaded %d definition items from master JSON.\n", len(entries))

	// If audit mode requested, run parity & codebase scan and return immediately
	if *checkOnly {
		runParityAndCodeAudit(entries)
		return
	}

	// 2. Resolve Environment Path (.env)
	loadEnv()

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatalln("[ERROR] DB_DSN environment variable is not set. Please verify .env file.")
	}
	dsn = strings.ReplaceAll(dsn, "host.docker.internal", "127.0.0.1")

	// 3. Connect to Database
	db, err := sqlx.Connect("mysql", dsn)
	if err != nil {
		log.Fatalf("[FATAL] Database connection failed: %v\n", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("[FATAL] Database ping failed: %v\n", err)
	}
	log.Println("[INFO] Successfully connected to MySQL.")

	// 4. Ensure RBAC Permission for system.localization.manage
	if !*dryRun {
		permQuery := `
			INSERT INTO permissions (name, description, ` + "`group`" + `)
			SELECT 'system.localization.manage', 'Mengelola kamus bahasa dan terjemahan sistem', 'System'
			FROM DUAL
			WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'system.localization.manage');
		`
		if _, err := db.Exec(permQuery); err != nil {
			log.Printf("[WARN] Failed to seed permission: %v\n", err)
		} else {
			log.Println("[INFO] Permission 'system.localization.manage' ensured in database.")
		}

		rolePermQuery := `
			INSERT IGNORE INTO role_permission (role_id, permission_id)
			SELECT 1, id FROM permissions WHERE name = 'system.localization.manage';
		`
		if _, err := db.Exec(rolePermQuery); err != nil {
			log.Printf("[WARN] Failed to assign permission to role 1: %v\n", err)
		} else {
			log.Println("[INFO] Permission assigned to Super Admin role (role_id = 1).")
		}
	}

	// 5. Validate and Execute Seed Upsert
	localeCounts := make(map[string]int)
	validationErrors := 0

	for idx, entry := range entries {
		mod := strings.TrimSpace(entry.Module)
		key := strings.TrimSpace(entry.Key)

		if mod == "" || key == "" {
			log.Printf("[WARN] Entry #%d missing module or key (module: '%s', key: '%s')\n", idx, mod, key)
			validationErrors++
			continue
		}

		for loc, val := range entry.Translations {
			locCode := strings.TrimSpace(loc)
			if *targetLocale != "" && locCode != *targetLocale {
				continue
			}

			valTrimmed := strings.TrimSpace(val)
			if valTrimmed == "" {
				log.Printf("[WARN] Missing translation for key '%s.%s' in locale '%s'\n", mod, key, locCode)
				continue
			}

			localeCounts[locCode]++

			if !*dryRun {
				query := `
					INSERT INTO localization_translations (locale_code, module, translation_key, translation_value)
					VALUES (?, ?, ?, ?)
					ON DUPLICATE KEY UPDATE
						translation_value = VALUES(translation_value),
						updated_at = CURRENT_TIMESTAMP
				`
				if _, err := db.Exec(query, locCode, mod, key, valTrimmed); err != nil {
					log.Fatalf("[FATAL] Failed to upsert translation for '%s.%s' (%s): %v\n", mod, key, locCode, err)
				}
			}
		}
	}

	if validationErrors > 0 {
		log.Printf("[WARN] Completed with %d validation warnings.\n", validationErrors)
	}

	// 5. Bump Locale Versions for Cache Invalidation if not dry-run
	if !*dryRun {
		for locCode := range localeCounts {
			updateVerQuery := `UPDATE localization_locales SET version = version + 1 WHERE code = ?`
			if _, err := db.Exec(updateVerQuery, locCode); err != nil {
				log.Printf("[WARN] Failed to increment version for locale '%s': %v\n", locCode, err)
			} else {
				log.Printf("[INFO] Incremented cache version for locale: %s\n", locCode)
			}
		}
	}

	// 6. Print Summary Report
	log.Println("-----------------------------------------------------")
	log.Println("  SYNC SUMMARY REPORT")
	log.Println("-----------------------------------------------------")
	for loc, count := range localeCounts {
		log.Printf("  • Locale %-7s: %d keys processed\n", loc, count)
	}
	if *dryRun {
		log.Println("[STATUS] DRY RUN COMPLETE - Everything verified successfully.")
	} else {
		log.Println("[STATUS] SUCCESS - All localization keys synced idempotently.")
	}
	log.Println("=====================================================")
}

func loadEnv() {
	// Try loading from current directory, parent directory, and grandparent directory
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

func resolveSeedPath(customPath string) string {
	if customPath != "" {
		absPath, err := filepath.Abs(customPath)
		if err == nil {
			return absPath
		}
		return customPath
	}

	// Default candidates
	candidates := []string{
		"backend/scripts/data/translations_seed.json",
		"scripts/data/translations_seed.json",
		"data/translations_seed.json",
		"../scripts/data/translations_seed.json",
	}

	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
	}

	// Fallback to first candidate relative path
	return filepath.Join("backend", "scripts", "data", "translations_seed.json")
}

func runParityAndCodeAudit(entries []SeedEntry) {
	log.Println("-----------------------------------------------------")
	log.Println("  AUDIT 1: Parity Check in Seed JSON (id-ID vs en-US)")
	log.Println("-----------------------------------------------------")

	masterKeys := make(map[string]bool)
	missingInEn := 0
	missingInId := 0

	for _, e := range entries {
		fullKey := fmt.Sprintf("%s.%s", strings.TrimSpace(e.Module), strings.TrimSpace(e.Key))
		masterKeys[fullKey] = true

		idVal := strings.TrimSpace(e.Translations["id-ID"])
		enVal := strings.TrimSpace(e.Translations["en-US"])

		if idVal == "" {
			log.Printf("  [MISSING id-ID] Key: %s\n", fullKey)
			missingInId++
		}
		if enVal == "" {
			log.Printf("  [MISSING en-US] Key: %s\n", fullKey)
			missingInEn++
		}
	}

	log.Printf("  Total Seed Entries: %d\n", len(entries))
	log.Printf("  Missing in id-ID : %d\n", missingInId)
	log.Printf("  Missing in en-US : %d\n", missingInEn)

	log.Println("-----------------------------------------------------")
	log.Println("  AUDIT 2: Codebase Translation Key Scan")
	log.Println("-----------------------------------------------------")

	frontendRegex := regexp.MustCompile(`(?:\$t|\bt)\(\s*['"]([a-zA-Z0-9_.-]+)['"]`)
	backendRegex := regexp.MustCompile(`(?:i18n\.T|TranslateByLocale|LocalizedError)\([^,]+,\s*(?:[^,]+,\s*)?["']([a-zA-Z0-9_.-]+)["']`)

	foundKeys := make(map[string][]string) // key -> []fileNames

	scanDirs := []struct {
		path  string
		regex *regexp.Regexp
		exts  []string
	}{
		{path: "frontend/src", regex: frontendRegex, exts: []string{".vue", ".ts"}},
		{path: "backend/internal", regex: backendRegex, exts: []string{".go"}},
	}

	for _, sd := range scanDirs {
		candidates := []string{sd.path, filepath.Join("..", sd.path), filepath.Join("../..", sd.path)}
		var targetDir string
		for _, cand := range candidates {
			if abs, err := filepath.Abs(cand); err == nil {
				if info, err := os.Stat(abs); err == nil && info.IsDir() {
					targetDir = abs
					break
				}
			}
		}

		if targetDir == "" {
			continue
		}

		_ = filepath.Walk(targetDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info == nil || info.IsDir() {
				return nil
			}
			lower := strings.ToLower(path)
			if strings.Contains(lower, "node_modules") || strings.Contains(lower, ".git") || strings.Contains(lower, "test") {
				return nil
			}

			matchedExt := false
			for _, ext := range sd.exts {
				if strings.HasSuffix(info.Name(), ext) {
					matchedExt = true
					break
				}
			}
			if !matchedExt {
				return nil
			}

			content, readErr := os.ReadFile(path)
			if readErr != nil {
				return nil
			}

			matches := sd.regex.FindAllStringSubmatch(string(content), -1)
			for _, m := range matches {
				if len(m) > 1 {
					k := m[1]
					foundKeys[k] = append(foundKeys[k], filepath.Base(path))
				}
			}
			return nil
		})
	}

	missingFromSeed := 0
	for k, files := range foundKeys {
		if !masterKeys[k] {
			missingFromSeed++
			limit := len(files)
			if limit > 2 {
				limit = 2
			}
			log.Printf("  [UNREGISTERED KEY] '%s' used in: %v\n", k, files[:limit])
		}
	}

	log.Printf("  Total Unique Keys in Codebase: %d\n", len(foundKeys))
	log.Printf("  Keys Missing from Seed JSON : %d\n", missingFromSeed)
	if missingInEn == 0 && missingInId == 0 && missingFromSeed == 0 {
		log.Println("[AUDIT RESULT] 100% PARITY & ZERO UNREGISTERED KEYS! All good.")
	} else {
		log.Println("[AUDIT RESULT] Action items found above. Please review and update dictionary.")
	}
}
