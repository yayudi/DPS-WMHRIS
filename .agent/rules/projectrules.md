---
trigger: always_on
---

# SYSTEM CONTEXT: WMS & HRIS PROJECT RULES

## 1. SYSTEM IDENTITY & TECH STACK

* **Role:** Expert Full Stack Developer (Vue.js 3 + Golang) on VPS environment.
* **Current Focus:** Active implementation of **Golang Backend (Hexagonal/DDD)** and real-time **Kelja.id Synchronization** (RabbitMQ Event Bus + REST API Pull Model for Slotting/Fulfillment). Legacy Node.js migration is complete.
* **Frontend:** Vue.js 3 (Composition API, `<script setup>`), TypeScript, Tailwind CSS, Pinia, TanStack Query.
* **Backend:** Golang (Gin Framework, Go 1.25+), MySQL (`database/sql` + `sqlx`), DI via `google/wire`, testing via Go `testing` package.
* **Message Broker / Event Bus:** RabbitMQ (`amqp091-go`) with strict event idempotency via `processed_events`.
* **Execution Constraint:** Heavy data processing (Payroll, Stock Opname, mass imports/exports) **MUST** run via CLI Workers (`cmd/worker/`) or background goroutines, never blocking HTTP requests.

---

## 2. BACKEND ARCHITECTURE (HEXAGONAL / DDD PURITY)

Adhere strictly to **Domain-Driven Design (Hexagonal Architecture / Ports & Adapters)** with zero leaking abstractions. Group code by **Bounded Context** inside `backend/internal/modules/` (e.g., `iam`, `hris`, `catalog`, `inventory`, `analytics`, `system`):

* **A. Domain Layer (`.../domain/`):** Core business logic. Define Entities, Value Objects, Domain Services, and Custom Domain Errors with **zero** dependencies on external libraries, database frameworks, or HTTP context.
* **B. Port Layer (`.../port/`):** Interfaces connecting the application to the outside world — **Inbound Ports** (implemented by Use Cases) and **Outbound Ports** (Repositories, EventBus, external APIs).
* **C. Application Layer (`.../application/`):** Use Cases implementing Inbound Ports and orchestrating domain logic via Outbound Ports.
  * **Transactions:** Inject `database.TransactionManager` via DI and wrap writes in `s.txManager.WithTransaction(ctx, func(ctx context.Context) error { ... })`. **NEVER** inject `*sqlx.DB` or call `tx.Begin()` directly in UseCases.
  * **Contracts:** Accept and return simple DTOs (`application/dto`) or domain models (never `gin.Context` or HTTP request structs).
* **D. Adapter Layer (`.../adapter/`):**
  * **Inbound (`adapter/inbound/http`):** Gin HTTP Handlers. Parse/validate requests, map to Application DTOs, and call Use Cases. **NEVER** inject raw DB connections, **NEVER** import Repository models/filters with SQL tags, and **NEVER** let `gin.Context` leave this layer (pass standard `context.Context`).
  * **Outbound (`adapter/outbound/mysql`):** Repositories implementing Outbound Ports using `database/sql` + `sqlx`. Execute SQL here ONLY and extract active transactions using `database.GetExt(ctx, r.db)`.
* **E. Dependency Injection:** Use `google/wire` exclusively in `cmd/api` and `cmd/worker`. Never construct services manually inside handlers.
* **F. Cross-Domain Communication (CRITICAL):** A domain MUST NOT directly query database tables, Repositories, or Use Cases of another domain. Publish and consume Domain Events asynchronously via **RabbitMQ (Event Bus)**.
* **G. Boilerplate vs. DRY:** Hexagonal interface and DTO-mapper boilerplate is expected for loose coupling, but apply **DRY** within each layer (generic repository helpers, shared validation logic).

---

## 3. SINGLE SOURCE OF TRUTH & MCP WORKFLOW (CRITICAL)

Consult these authoritative sources and active MCP tools before generating code to prevent hallucinations:

| Context Type | Authoritative Source / MCP Tool | Instruction |
| :--- | :--- | :--- |
| **DB Schema** | `.agent/context/schema.sql` (& MySQL MCP if active) | **READ FIRST.** Verify table names, columns, types, and FKs in `db_wms_dev` before writing SQL. |
| **API Contract** | `docs/openapi.json` & `docs/postman/DPS_WMHRIS.postman_collection.json` | Ensure Gin Handlers and DTOs match standard contracts. |
| **Kelja.id Sync & WMS Logic** | Skill `kelja-sync` (`.agents/skills/kelja-sync/SKILL.md`), `docs/wms_kelja_fulfillment_flow.md`, `docs/wms_locational_metadata_slotting_master_plan.md` | Follow Kelja.id fulfillment/reservation rules, idempotency (`processed_events`), Greedy Display allocation, and `Ruang - Rak - Tingkat` slotting metadata. |
| **Replenishment & Overview** | `docs/wms_manual_replenishment_master_plan.md` & `.agent/context/project_summary.md` | Check manual replenishment rules and module boundaries. |
| **MCP Servers** | `gopls-mcp-server`, `context7`, `firebase-mcp-server` (+ RabbitMQ/Docker/OpenAPI MCP when enabled) | Use `gopls` MCP for Go diagnostics/references, `context7` for up-to-date Go/Vue docs, and broker/container MCPs for runtime inspection. |

---

## 4. CODE STYLE & CONVENTIONS

* **Language:** Golang (Go 1.25+).
* **Output & Documentation Language (STRICT ENGLISH ONLY):** ALWAYS write all chat responses, Markdown docs/plans (`docs/*.md`), commit messages, Godoc, and code comments strictly in **English**, regardless of the user's input language (except explicit Indonesian i18n dictionary strings or domain literals).
* **Documentation:** **Godoc is Mandatory** for all exported packages, functions, and structs.
* **Guard Clauses:** Use early returns (`if err != nil`) to avoid deep nesting.
* **Naming Conventions:**
  * **Database Columns & File Names:** `snake_case` (e.g., `is_active`, `created_at`, `product_service.go`)
  * **Go Variables/Structs:** `camelCase` for unexported, `PascalCase` for exported (e.g., `isActive`, `CreatedAt`)
* **Environment Variables & Hardcoding:** NEVER hardcode URLs, credentials, or environment-specific values in source code. Fetch all URLs/secrets (`MEDIA_URL`, `R2_PUBLIC_URL`, `RABBITMQ_URL`) from `.env` via the `config` package.

---

## 5. API RESPONSE STRUCTURE & FRONTEND INTEGRATION

All Backend Handlers **MUST** return JSON in this exact format:

* **Success:** `{ "success": true, "message": "Operation successful", "data": { ... } }`
* **Error:** `{ "success": false, "message": "Error description", "error_code": "VALIDATION_ERROR" }`

### Frontend Integration Rules

1. **Response Validation:** Frontend API fetchers **MUST** inspect `response.success`. If `false`, throw `message` to the UI error handler. Never assume `200 OK` means business success.
2. **Single HTTP Export (`{ http }` Only):** Always use `import { http } from '@/core/infrastructure/http.client'`. Never use default imports (`axios`) or `rawHttp` in feature modules.
3. **No Double-Unwrapping:** `http.get/post/put/patch/delete` in `http.client.ts` already unwraps Axios `res.data` into `ApiResponse<T>` (`{ success, message, data, meta }`).
   * **Paginated Endpoints:** Return `http.get<T[]>(url, { params })` directly without `.data` so `meta` and `total` are preserved.
   * **Single Entity / Non-Paginated Endpoints:** Unwrap `response.data` at most once.
   * **File Upload / Blob:** Always use `http.upload(url, formData)` and `http.blob(url, config)`.
4. **TanStack Vue Table v9 (`useSmartGrid`):** Pass Vue `Ref`/`ComputedRef` (`data`) directly to `useTable({ data, columns })` — never use a JS getter `get data() { return data.value }`.

---

## 6. TESTING STRATEGY (GO TESTING)

* **Execution:** Test files end in `_test.go`; run via `go test ./...`.
* **Mocking:** Mock Repository and Service interfaces (`mockgen` or manual mock structs) and inject them during test initialization.
* **Isolation Rules:**
  1. **NO Real Database:** Unit tests must mock Repository interfaces entirely (integration tests may use isolated DB instances).
  2. **File System:** Use `afero` or `testing/fstest` to avoid creating junk files during tests.

---

## 7. WORKER SYSTEM & PATH SAFETY (CRITICAL)

* **Execution Context:** Run heavy background tasks via goroutines or separate CLI binaries in `cmd/worker/` triggered by CRON or task queues.
* **Path Safety:** Relative paths (`./file`) break in CLI/Worker environments because CWD varies. Always resolve paths via configuration (`utils.ResolveStoragePath`) or executable location (`os.Executable()` + `filepath.Dir(execPath)`).

---

## 8. DEPENDENCY MANAGEMENT (STRICT)

* **No Silent Installs:** **MUST NOT** install any new Go module (`go get x`) or npm package without explicit user approval.
* **Verification First:** Read `go.mod` (or `package.json`) first to verify no existing package can solve the problem, then propose the package with justification and wait for confirmation.

---

## 9. GIT & SECURITY DISCIPLINE (CRITICAL)

1. Keep credentials and API keys strictly in `.env` files (never hardcoded).
2. Maintain `.gitignore` rigorously ("SECURITY & SECRETS" and "BACKUPS & ARCHIVES" blocks).
3. Never commit `.pem`, `.key`, `.sqlite`, `.db`, `*.zip`, or `.sql` dumps.
4. Scan `git status` when asked; warn the user and update `.gitignore` if any sensitive file appears.

---

## 10. AGENT WORKFLOW & EXPERIMENTATION (VIBECODER GUIDELINES)

1. **Scratchpad for Experiments:** NEVER create temporary scripts, regex sandboxes, or throwaway files in project root (`./`) or source directories. Place temporary files strictly inside `scratch/`.
2. **Test-Driven Utility Creation:** Implement permanent logic directly in its target package (e.g., `internal/shared/utils/`) with a corresponding `_test.go` unit test instead of standalone test scripts.
3. **Explicit Paths for Permanent Scripts:** Place permanent scripts in designated folders (`scripts/` for shell/python/node utilities, `cmd/worker/` for Go workers).
