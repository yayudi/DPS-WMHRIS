//go:build ignore

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	auditDry := flag.Bool("audit-dry", false, "Audit unused/orphan keys and duplicate translation pairs across modules")
	purgeOrphans := flag.Bool("purge-orphans", false, "Purge unreferenced orphan keys from seed JSON and frontend dictionaries")
	syncFe := flag.Bool("sync-fe", false, "Deterministically sort seed JSON and auto-generate frontend defaultDictionaries.ts")
	pruneDB := flag.Bool("prune", false, "Delete obsolete keys from database that are no longer present in seed JSON")
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

	// Execute deterministic SSoT sort and frontend dictionary codegen if requested
	if *syncFe && !*purgeOrphans {
		if err := syncFrontendDictionaries(resolvedSeedPath, entries); err != nil {
			log.Fatalf("[FATAL] Failed to sync frontend dictionaries: %v\n", err)
		}
	}

	// Purge unreferenced orphan keys if requested
	if *purgeOrphans {
		orphans := runParityAndCodeAudit(entries, true)
		if len(orphans) > 0 {
			orphanMap := make(map[string]bool, len(orphans))
			for _, k := range orphans {
				orphanMap[k] = true
			}
			var cleaned []SeedEntry
			for _, e := range entries {
				fk := fmt.Sprintf("%s.%s", strings.TrimSpace(e.Module), strings.TrimSpace(e.Key))
				if !orphanMap[fk] {
					cleaned = append(cleaned, e)
				}
			}
			log.Printf("[PURGE] Removing %d unreferenced orphan keys (%d -> %d entries)...\n", len(orphans), len(entries), len(cleaned))
			if err := syncFrontendDictionaries(resolvedSeedPath, cleaned); err != nil {
				log.Fatalf("[FATAL] Failed to update seed and frontend dictionaries: %v\n", err)
			}
			entries = cleaned
			log.Printf("[PURGE] Successfully purged %d orphan keys from seed JSON and frontend dictionary!\n", len(orphans))
		} else {
			log.Println("[PURGE] Zero orphan keys found. Nothing to purge.")
		}
		if *checkOnly || *auditDry {
			log.Println("\n=====================================================")
			log.Println("  POST-PURGE VERIFICATION AUDIT")
			log.Println("=====================================================")
			runParityAndCodeAudit(entries, *auditDry)
			return
		}
		if !*pruneDB && *targetLocale == "" && !*dryRun {
			return
		}
	}

	// If audit mode requested, run parity, codebase, and optional DRY scan then return
	if *checkOnly || *auditDry {
		runParityAndCodeAudit(entries, *auditDry)
		return
	}

	// If only -sync-fe was requested without DB flags, exit cleanly
	if *syncFe && !*pruneDB && *targetLocale == "" && !*dryRun {
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

	// 4b. Prune obsolete database keys if -prune is enabled
	if *pruneDB {
		masterSet := make(map[string]bool, len(entries))
		for _, e := range entries {
			masterSet[strings.TrimSpace(e.Module)+"."+strings.TrimSpace(e.Key)] = true
		}
		type dbKeyRow struct {
			ID     int64  `db:"id"`
			Module string `db:"module"`
			Key    string `db:"translation_key"`
		}
		var rows []dbKeyRow
		if err := db.Select(&rows, `SELECT id, module, translation_key FROM localization_translations`); err != nil {
			log.Printf("[WARN] Failed to query keys for pruning: %v\n", err)
		} else {
			prunedCount := 0
			for _, r := range rows {
				full := strings.TrimSpace(r.Module) + "." + strings.TrimSpace(r.Key)
				if !masterSet[full] {
					prunedCount++
					if !*dryRun {
						_, _ = db.Exec(`DELETE FROM localization_translations WHERE id = ?`, r.ID)
					}
				}
			}
			log.Printf("[INFO] Pruned %d obsolete translation row(s) not present in seed SSoT.\n", prunedCount)
		}
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

func encodeJSONUnescaped(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func resolveFrontendDictPath() string {
	candidates := []string{
		"frontend/src/core/domain/defaultDictionaries.ts",
		"../frontend/src/core/domain/defaultDictionaries.ts",
		"../../frontend/src/core/domain/defaultDictionaries.ts",
	}
	for _, c := range candidates {
		if abs, err := filepath.Abs(c); err == nil {
			if _, err := os.Stat(filepath.Dir(abs)); err == nil {
				return abs
			}
		}
	}
	return filepath.Join("frontend", "src", "core", "domain", "defaultDictionaries.ts")
}

func syncFrontendDictionaries(seedPath string, entries []SeedEntry) error {
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Module != entries[j].Module {
			return entries[i].Module < entries[j].Module
		}
		return entries[i].Key < entries[j].Key
	})

	seedBytes, err := encodeJSONUnescaped(entries)
	if err != nil {
		return fmt.Errorf("encode seed JSON: %w", err)
	}
	if err := os.WriteFile(seedPath, seedBytes, 0644); err != nil {
		return fmt.Errorf("write seed JSON: %w", err)
	}
	log.Printf("[SYNC-FE] Sorted and formatted master SSoT: %s (%d entries)\n", seedPath, len(entries))

	idDict := make(map[string]string, len(entries))
	enDict := make(map[string]string, len(entries))
	for _, item := range entries {
		fullKey := strings.TrimSpace(item.Module) + "." + strings.TrimSpace(item.Key)
		idDict[fullKey] = item.Translations["id-ID"]
		enDict[fullKey] = item.Translations["en-US"]
	}

	idBytes, err := encodeJSONUnescaped(idDict)
	if err != nil {
		return fmt.Errorf("encode id-ID dict: %w", err)
	}
	enBytes, err := encodeJSONUnescaped(enDict)
	if err != nil {
		return fmt.Errorf("encode en-US dict: %w", err)
	}

	dictPath := resolveFrontendDictPath()
	content := fmt.Sprintf(`/**
 * Baseline Default Dictionaries for DPS-WMHRIS (id-ID and en-US).
 * Generated automatically from backend/scripts/data/translations_seed.json.
 * Total bilingual keys: %d
 */

export const DEFAULT_ID_DICTIONARY: Record<string, string> = %s

export const DEFAULT_EN_DICTIONARY: Record<string, string> = %s

export const BASELINE_ID_ID = DEFAULT_ID_DICTIONARY
export const BASELINE_EN_US = DEFAULT_EN_DICTIONARY

export function getBaselineDictionary(locale: string): Record<string, string> {
  if (locale === 'en-US') {
    return { ...DEFAULT_ID_DICTIONARY, ...DEFAULT_EN_DICTIONARY }
  }
  return { ...DEFAULT_ID_DICTIONARY }
}
`,
		len(entries),
		strings.TrimSpace(string(idBytes)),
		strings.TrimSpace(string(enBytes)),
	)

	if err := os.WriteFile(dictPath, []byte(content), 0644); err != nil {
		return fmt.Errorf("write frontend defaultDictionaries.ts: %w", err)
	}
	log.Printf("[SYNC-FE] Auto-generated frontend dictionary: %s (%d bilingual keys)\n", dictPath, len(entries))
	return nil
}

func runParityAndCodeAudit(entries []SeedEntry, includeDryAudit bool) []string {
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

	frontendRegex := regexp.MustCompile(`(?:\$t|\bt|getTranslation)\(\s*['"]([a-z_0-9]+\.[a-zA-Z0-9_.-]+)['"]`)
	backendRegex := regexp.MustCompile(`(?:i18n\.T|TranslateByLocale|LocalizedError|LocalizedSuccess|apperror\.(?:New|NotFound|Conflict|Validation|Forbidden|Unauthorized|Internal|Wrap))\([^)]*?["']([a-z_0-9]+\.[a-zA-Z0-9_.-]+)["']`)
	literalKeyRegex := regexp.MustCompile(`['"]([a-z_]+\.[a-zA-Z0-9_.-]+)['"]`)
	hardcodedResponseRegex := regexp.MustCompile(`(?:SuccessResponse|JobCreatedResponse)\([^,]+,\s*[^,]+,\s*"([^"]+)"`)
	setLocalizedHeadersRegex := regexp.MustCompile(`SetLocalizedHeaders\([^)]*?\[\]string\s*\{([^}]*)\}`)
	sliceStringLiteralRegex := regexp.MustCompile(`["']([a-z_0-9]+\.[a-zA-Z0-9_.-]+)["']`)
	upperErrorCodeRegex := regexp.MustCompile(`"([A-Z][A-Z0-9_]{2,})"`)
	feTemplatePrefixRegex := regexp.MustCompile("(?:\\$t|\\bt|getTranslation)\\(\\s*\\x60([a-z_0-9]+\\.[a-zA-Z0-9_.-]+?)\\$\\{")

	foundKeys := make(map[string][]string) // key -> []fileNames
	allReferencedLiterals := make(map[string]bool)
	dynamicPrefixMap := map[string]bool{
		"analytics.reports.job_": true,
		"common.day.":            true,
	}
	var hardcodedResponses []string

	scanDirs := []struct {
		path  string
		regex *regexp.Regexp
		exts  []string
	}{
		{path: "frontend/src", regex: frontendRegex, exts: []string{".vue", ".ts"}},
		{path: "backend/internal", regex: backendRegex, exts: []string{".go"}},
		{path: "backend/cmd", regex: backendRegex, exts: []string{".go"}},
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
			if strings.Contains(lower, "node_modules") || strings.Contains(lower, ".git") || strings.Contains(lower, "defaultdictionaries.ts") ||
				strings.HasSuffix(lower, "_test.go") || strings.HasSuffix(lower, ".test.ts") || strings.HasSuffix(lower, ".spec.ts") ||
				strings.Contains(lower, "testdata") {
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
			text := string(content)

			matches := sd.regex.FindAllStringSubmatch(text, -1)
			for _, m := range matches {
				if len(m) > 1 {
					k := m[1]
					foundKeys[k] = append(foundKeys[k], filepath.Base(path))
					allReferencedLiterals[k] = true
				}
			}

			if strings.HasSuffix(info.Name(), ".go") {
				// Map uppercase error code literals to errors.<lowercase> keys resolved dynamically by i18n.TranslateErrorCode
				for _, cm := range upperErrorCodeRegex.FindAllStringSubmatch(text, -1) {
					if len(cm) > 1 {
						codeKey := strings.ToLower(cm[1])
						if codeKey == "invalid_request" {
							codeKey = "bad_request"
						}
						errKey := "errors." + codeKey
						if masterKeys[errKey] {
							allReferencedLiterals[errKey] = true
						}
					}
				}
			} else {
				// Collect FE template-literal key prefixes (e.g. wms.stock_requests.filter_${...})
				for _, pm := range feTemplatePrefixRegex.FindAllStringSubmatch(text, -1) {
					if len(pm) > 1 {
						dynamicPrefixMap[pm[1]] = true
					}
				}
			}

			if strings.HasSuffix(path, ".go") {
				for _, shm := range setLocalizedHeadersRegex.FindAllStringSubmatch(text, -1) {
					if len(shm) > 1 {
						for _, skm := range sliceStringLiteralRegex.FindAllStringSubmatch(shm[1], -1) {
							if len(skm) > 1 {
								k := skm[1]
								foundKeys[k] = append(foundKeys[k], filepath.Base(path))
								allReferencedLiterals[k] = true
							}
						}
					}
				}
			}

			if includeDryAudit {
				litMatches := literalKeyRegex.FindAllStringSubmatch(text, -1)
				for _, lm := range litMatches {
					if len(lm) > 1 && masterKeys[lm[1]] {
						allReferencedLiterals[lm[1]] = true
					}
				}
				if strings.HasSuffix(path, ".go") {
					respMatches := hardcodedResponseRegex.FindAllStringSubmatch(text, -1)
					for _, rm := range respMatches {
						if len(rm) > 1 {
							msg := strings.TrimSpace(rm[1])
							if strings.Contains(msg, " ") && !strings.Contains(msg, ".") {
								hardcodedResponses = append(hardcodedResponses, fmt.Sprintf("%s: %s", filepath.Base(path), msg))
							}
						}
					}
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

	var orphanKeys []string
	if includeDryAudit {
		log.Println("-----------------------------------------------------")
		log.Println("  AUDIT 3: Orphan / Unused Keys Scan (DRY)")
		log.Println("-----------------------------------------------------")
		for _, e := range entries {
			fullKey := fmt.Sprintf("%s.%s", strings.TrimSpace(e.Module), strings.TrimSpace(e.Key))
			if allReferencedLiterals[fullKey] {
				continue
			}
			whitelisted := false
			for pfx := range dynamicPrefixMap {
				if strings.HasPrefix(fullKey, pfx) {
					whitelisted = true
					break
				}
			}
			if !whitelisted {
				orphanKeys = append(orphanKeys, fullKey)
			}
		}
		log.Printf("  Referenced Keys (Direct + Map Literals): %d\n", len(allReferencedLiterals))
		log.Printf("  Unreferenced / Orphan Keys in Seed     : %d\n", len(orphanKeys))

		log.Println("-----------------------------------------------------")
		log.Println("  AUDIT 4: Duplicate Translation Pairs Scan (DRY)")
		log.Println("-----------------------------------------------------")
		pairMap := make(map[string][]string)
		commonPairMap := make(map[string][]string)
		for _, e := range entries {
			mod := strings.TrimSpace(e.Module)
			fullKey := fmt.Sprintf("%s.%s", mod, strings.TrimSpace(e.Key))
			pair := strings.TrimSpace(e.Translations["id-ID"]) + " || " + strings.TrimSpace(e.Translations["en-US"])
			pairMap[pair] = append(pairMap[pair], fullKey)
			if mod == "common" {
				commonPairMap[pair] = append(commonPairMap[pair], fullKey)
			}
		}

		commonDupPairs := 0
		for pair, keys := range commonPairMap {
			if len(keys) > 1 {
				commonDupPairs++
				log.Printf("  [COMMON DUP] (%s) -> %v\n", pair, keys)
			}
		}
		totalDupPairs := 0
		redundantKeys := 0
		for _, keys := range pairMap {
			if len(keys) > 1 {
				totalDupPairs++
				redundantKeys += len(keys) - 1
			}
		}
		log.Printf("  Internal common.* Duplicate Pairs : %d\n", commonDupPairs)
		log.Printf("  Cross-Module Duplicate Pairs      : %d (%d redundant keys)\n", totalDupPairs, redundantKeys)

		log.Println("-----------------------------------------------------")
		log.Println("  AUDIT 5: Backend Hardcoded Literal Response Scan (DX)")
		log.Println("-----------------------------------------------------")
		log.Printf("  Hardcoded Response Literals Remaining: %d\n", len(hardcodedResponses))
		if len(hardcodedResponses) > 0 {
			limit := len(hardcodedResponses)
			if limit > 5 {
				limit = 5
			}
			for i := 0; i < limit; i++ {
				log.Printf("    • %s\n", hardcodedResponses[i])
			}
			if len(hardcodedResponses) > 5 {
				log.Printf("    ... and %d more across handlers\n", len(hardcodedResponses)-5)
			}
		}
	}

	if missingInEn == 0 && missingInId == 0 && missingFromSeed == 0 {
		log.Println("[AUDIT RESULT] 100% PARITY & ZERO UNREGISTERED KEYS! All good.")
	} else {
		log.Println("[AUDIT RESULT] Action items found above. Please review and update dictionary.")
	}
	return orphanKeys
}
