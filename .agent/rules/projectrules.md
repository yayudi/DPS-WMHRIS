---
trigger: always_on
---

# SYSTEM CONTEXT: WMS & HRIS PROJECT RULES

## 1. SYSTEM IDENTITY & TECH STACK
**Role:** Expert Full Stack Developer (Vue.js + Golang).
**Environment:** VPS (Virtual Private Server).

### Technology Stack
* **Frontend:** Vue.js 3 (Composition API, `<script setup>`), Tailwind CSS.
* **Backend:** Golang (Gin Framework), MySQL (Library: `database/sql` + `sqlx`).
* **Message Broker / Event Bus:** RabbitMQ.
* **Testing:** Go `testing` package.
* **Execution Constraint:** Heavy data processing **MUST** run via CLI Workers/Goroutines, never blocking HTTP requests to avoid timeouts.

---

## 2. BACKEND ARCHITECTURE (HEXAGONAL / PORTS & ADAPTERS)
Adhere strictly to the **Domain-Driven Design (Hexagonal Architecture)** pattern.
The backend code must be grouped by **Domain / Bounded Context** inside `backend/internal/modules/` (e.g., `iam`, `hris`, `catalog`, `inventory`).
Within each domain folder, the standard layers are maintained:

### A. Domain Layer (`.../domain/`)
**Role:** The Core Business Logic.
* **DO:**
    * Define Entities, Value Objects, and Domain Services.
    * Implement pure business logic without depending on ANY external libraries, database frameworks, or HTTP context.
    * Define Custom Domain Errors.

### B. Port Layer (`.../port/`)
**Role:** Interfaces connecting the Application to the Outside World.
* **DO:**
    * Define **Inbound Ports** (Interfaces implemented by Use Cases).
    * Define **Outbound Ports** (Interfaces for Repositories, EventBus, external APIs).

### C. Application Layer (`.../application/`)
**Role:** Application Use Cases (formerly Service layer).
* **DO:**
    * Implement Inbound Ports.
    * Orchestrate domain logic using Entities and Outbound Ports (e.g., calling Repositories).
    * **Manage Transactions:** Use `database.TransactionManager` injected via DI. Wrap operations in `s.txManager.WithTransaction(ctx, func(ctx context.Context) error { ... })`. **NEVER** inject `*sqlx.DB` directly into UseCases.
    * Accept and return simple DTOs or domain models (NO `gin.Context` or HTTP Request structures).

### D. Adapter Layer (`.../adapter/`)
**Role:** External integration (HTTP, Database, Event Listeners).
* **DO:**
    * **Inbound (`adapter/inbound/http`)**: HTTP Handlers. Parse HTTP requests (Gin), perform structural validation, map to Application DTOs, and call Application Use Cases. **NEVER** inject raw database connections here.
    * **Outbound (`adapter/outbound/mysql`)**: Repositories implementing Outbound Ports using `database/sql` + `sqlx`. Handle SQL execution here ONLY. Extract active transactions gracefully using `database.GetExt(ctx, r.db)`.

### E. Cross-Domain Communication (CRITICAL)
* **Rule:** A domain MUST NOT directly query the database tables, Repositories, or Application Use Cases of another domain.
* **Practice:** Use **RabbitMQ (Event Bus)** to publish and consume Domain Events to communicate state changes asynchronously across domains.

### F. Boilerplate vs. DRY
* **Rule:** Hexagonal Architecture introduces boilerplate (e.g., interface definitions, DTO-to-Entity mappers). This boilerplate is **ALLOWED** and expected for loose coupling.
* **Practice:** Even with boilerplate, apply **DRY (Don't Repeat Yourself)** principles within each layer where possible (e.g., generic repository helpers, shared validation logic).

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
* **Environment Variables & Hardcoding:** NEVER hardcode URLs, credentials, or environment-specific values in the source code. All URLs (like `MEDIA_URL`, `R2_PUBLIC_URL`, `RABBITMQ_URL`) MUST be fetched from the `.env` file via the `config` package.

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

## 10. MAINTAINING DDD PURITY (CRITICAL)
**Context:** The project has achieved 100% Hexagonal Architecture (DDD) compliance. We must maintain this purity.
* **Rule:** Do not introduce ANY leaking abstractions under any circumstances.
* **Procedure:**
    1. **Dependency Injection:** Use `google/wire` exclusively in `cmd/api` and `cmd/worker`. Never construct services manually inside handlers.
    2. **Transactions:** Never use `tx.Begin()` directly. Always inject `TransactionManager` into UseCases and use `WithTransaction(ctx, ...)`.
    3. **HTTP Context:** The `gin.Context` object MUST NOT leave the `adapter/inbound/http` layer. Use standard `context.Context` everywhere else.
    4. **Database Models:** Repository models (e.g., `Filter` structs with SQL tags) MUST NOT be imported into Handlers. Handlers must parse input into Application DTOs (`application/dto`).