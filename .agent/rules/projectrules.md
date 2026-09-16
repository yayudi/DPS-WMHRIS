---
trigger: always_on
---

# SYSTEM CONTEXT: WMS & HRIS PROJECT RULES

## 1. SYSTEM IDENTITY & TECH STACK
**Role:** Expert Full Stack Developer (Vue.js + Golang).
**Environment:** VPS (Virtual Private Server).

### Technology Stack
* **Frontend:** Vue.js 3 (Composition API, `<script setup>`), Tailwind CSS.
* **Backend:** Golang (Standard Library or Gin/Fiber), MySQL (Library: `database/sql` + `sqlx` or `gorm`).
* **Testing:** Go `testing` package.
* **Execution Constraint:** Heavy data processing **MUST** run via CLI Workers/Goroutines, never blocking HTTP requests to avoid timeouts.

---

## 2. BACKEND ARCHITECTURE (MODULAR DDD)
Adhere strictly to the **Domain-Driven Design (Modular Monolith)** pattern.
The backend code must be grouped by **Domain / Bounded Context** inside `backend/internal/modules/` (e.g., `iam`, `hris`, `catalog`, `inventory`).
Within each domain folder, the standard layers are maintained:

### A. Repository Layer (`.../repository/`)
**Role:** SQL Query Executor ONLY.
* **DO:**
    * Handle `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
    * Accept `context.Context` and database connection/transaction (`*sql.DB` or `*sql.Tx`) as parameters.
    * Use **snake_case** for raw SQL column names.
    * **SQLx STRICT MAPPING:** Be careful when using `SELECT *`. `sqlx` will panic/error (`missing destination name...`) if the query returns a column that doesn't exist in the destination Go `struct`. Either explicitly `SELECT` only the columns you need, or ensure the Go `struct` is perfectly 1:1 mapped to the DB schema (including `db:"..."` tags for every nullable/new column).
    * Add Godoc comments for every function.
    * **SECURITY:** ALWAYS use parameterized queries (`?`). NEVER use string concatenation for values inside SQL strings.
* **DO NOT:**
    * Write Business Logic.
    * Handle Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) unless it's a specific transaction repository function.
    * Import global DB config directly (use Dependency Injection).

### B. Service Layer (`.../service/`)
**Role:** The "Brain" & Orchestrator.
* **DO:**
    * Manage Transactions: Orchestrate multiple repository calls within a transaction.
    * **Audit Logging:** Log every data change.
    * **Validation:** Validate business rules and return standard `error`.
    * Add Godoc comments for every function.

### C. Controller/Handler Layer (`.../handler/`)
**Role:** HTTP Interface.
* **DO:**
    * Parse HTTP requests and bind JSON/Forms to Go structs.
    * **Validation:** Perform structural validation (e.g. valid email, numeric quantity) BEFORE calling Services (using `validator` package).
    * Call Services.
    * Return standardized JSON responses.
    * Catch Service errors and map to appropriate HTTP Status Codes (400, 404, 500).
* **DO NOT:**
    * Write ANY SQL queries.
    * Contain complex business logic.

### D. Cross-Domain Communication (CRITICAL)
* **Rule:** A domain MUST NOT directly query the database tables or call the Repository of another domain.
* **Practice:** Use **Domain Events** (event-driven) to communicate state changes across domains.

---

## 3. SINGLE SOURCE OF TRUTH (CRITICAL)
The Agent **MUST** read these files before generating code to prevent hallucinations.

| Context Type | File Path | Instruction |
| :--- | :--- | :--- |
| **DB Schema** | `.agent/context/schema.sql` | **READ FIRST.** Verify table names, columns, types, and FKs before writing SQL. |
| **API Contract** | `.agent/context/api_docs.md` | Ensure Handlers output JSON matching these contracts. |
| **Business Logic** | `.agent/context/architecture.md` | Check specific WMS rules (e.g., FIFO, Stock validation). |

---

## 4. CODE STYLE & CONVENTIONS
* **Language:** Golang (Go 1.21+).
* **Documentation:** **Godoc is Mandatory** for all exported packages, functions, and structs.
* **Guard Clauses:** Use early returns (`if err != nil`) to avoid deep nesting.
* **Naming Conventions:**
    * **Database Columns:** `snake_case` (e.g., `is_active`, `created_at`)
    * **Go Variables/Structs:** `camelCase` for unexported, `PascalCase` for exported (e.g., `isActive`, `CreatedAt`)
    * **Files:** `snake_case` (e.g., `product_service.go`, `user_repository.go`)
* **Environment Variables & Hardcoding:** NEVER hardcode URLs, credentials, or environment-specific values in the source code. All URLs (like `MEDIA_URL`, `R2_PUBLIC_URL`) MUST be fetched from the `.env` file via the config package.

---

## 5. API RESPONSE STRUCTURE
All Handlers **MUST** return JSON in this exact format.

### Frontend Integration Rule
Frontend API fetchers **MUST** inspect `response.success`. If `false`, throw the `message` to the UI error handler. Do not blindly assume 200 OK means success.

**Success:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error_code": "VALIDATION_ERROR"
}
```

---

## 6. TESTING STRATEGY (GO TESTING)
The project uses the standard Go `testing` package.

### A. Environment Configuration
* **File Extension:** Test files must end in `_test.go`.
* **Execution:** Run tests using `go test ./...`.

### B. Mocking Strategy
* **Method:** Use interfaces for Repositories and Services. Generate mocks using `mockgen` or write manual mock structs to satisfy interfaces.
* **Pattern:** Inject mock dependencies into the Service/Handler during test initialization.

### C. Isolation Rules
1.  **NO Real Database:** For unit tests, mock the Repository interface entirely. Integration tests can use isolated DB instances (e.g., testcontainers).
2.  **File System:** Use `afero` or standard Go `testing/fstest` to mock file systems during tests to prevent creating junk files.

---

## 7. WORKER SYSTEM (CLI & BACKGROUND JOBS)
**Context:** VPS. Heavy processes (e.g., Payroll calculation, Stock Opname) **MUST** run as CLI scripts or Daemon, not blocking HTTP requests.

### A. Execution Context
* **Entry Point:** Goroutines for in-process background tasks, or separate CLI binaries in `cmd/worker/`.
* **Trigger:** Executed via CRON jobs invoking the CLI binary, or internal task queues.

### B. Path Safety (CRITICAL)
**Problem:** Relative paths (`./file`) break in CLI/Worker environments because the execution directory varies.
**Rule:** Use absolute paths based on configuration or executable location.

* **DO NOT:**
    ```go
    file, err := os.Open("./data/export.csv") // WILL FAIL if executed from different dir
    ```
* **DO:**
    ```go
    execPath, _ := os.Executable()
    baseDir := filepath.Dir(execPath)
    filePath := filepath.Join(baseDir, "../../storage/exports/data.csv")
    ```

---

## 8. DEPENDENCY MANAGEMENT (STRICT)
**Context:** To prevent bloat, security risks, and compatibility issues, no new modules should be added without explicit approval.

### A. No Silent Installs
* **Rule:** The Agent **MUST NOT** install any new Go module (e.g., `go get x`) without first asking for permission.
* **Procedure:**
    1.  Check if an existing package can solve the problem (Read `go.mod`).
    2.  If not, propose the new package with a justification.
    3.  Wait for user confirmation (Yes/No).

### B. Verification First
* **Proof of Awareness:** Before suggesting a new library, the Agent must prove it has read `go.mod` to verify the library doesn't already exist or a similar one isn't available.

---

## 9. GIT & SECURITY DISCIPLINE (CRITICAL)
**Context:** To prevent sensitive data leaks and keep the repository clean.

* **Rule:** You MUST NOT track or commit sensitive files, credentials, or large local backups.
* **Procedure:**
    1. Ensure credentials and API keys are only kept in `.env` files and never hardcoded.
    2. Maintain the `.gitignore` rules rigorously, especially the "SECURITY & SECRETS" and "BACKUPS & ARCHIVES" blocks.
    3. Do not commit `.pem`, `.key`, `.sqlite`, `.db`, `*.zip`, or accidental database `.sql` dumps to the root directory.
    4. Regularly scan `git status` when asked, and if any untracked or tracked sensitive file is found, warn the user and add it to `.gitignore`.

---

## 10. BACKEND-GO-STABLE AS THE SOURCE OF TRUTH (CRITICAL)
**Context:** We are refactoring the Golang backend architecture into a Domain-Driven Design (DDD) Modular Monolith.
* **Rule:** The `backend-go-stable/` folder is the ABSOLUTE SOURCE OF TRUTH for existing business logic, validation, and endpoint schemas.
* **Procedure:**
    1. Before migrating any module, you MUST analyze the corresponding handler, service, and repository inside `backend-go-stable/`.
    2. Ensure that the new DDD implementation precisely matches the logic, responses, and behavior of the `backend-go-stable` implementation, unless specifically instructed otherwise.
    3. Use Domain Events to decouple cross-domain interactions that previously used direct service/repository injection in the stable backend.