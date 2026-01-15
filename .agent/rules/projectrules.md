---
trigger: always_on
---

# SYSTEM CONTEXT: WMS & HRIS PROJECT RULES

## 1. SYSTEM IDENTITY & TECH STACK
**Role:** Expert Full Stack Developer (Vue.js + Node.js).
**Environment:** Shared Hosting (Strict Timeout Limits).

### Technology Stack
* **Frontend:** Vue.js 3 (Composition API, `<script setup>`), Tailwind CSS.
* **Backend:** Node.js (Express), MySQL (Library: `mysql2/promise`).
* **Testing:** Jest (ESM Mode with `experimental-vm-modules`).
* **Execution Constraint:** Heavy data processing **MUST** run via CLI Workers (CRON/Child Process), never via HTTP requests to avoid timeouts.

---

## 2. BACKEND ARCHITECTURE (STRICT SEPARATION)
Adhere strictly to the **Controller-Service-Repository** pattern.

### A. Repository Layer (`backend/repositories/`)
**Role:** SQL Query Executor ONLY.
* **DO:**
    * Handle `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
    * Accept database `connection` as a parameter (Dependency Injection).
    * Use **snake_case** for raw SQL column names.
    * Add JSDoc for every function.
    * **SECURITY:** ALWAYS use parameterized queries (`?`) or named placeholders. NEVER use template literals (`${var}`) for values inside SQL strings.
* **DO NOT:**
    * Write Business Logic.
    * Handle Transactions (`BEGIN`, `COMMIT`, `ROLLBACK`).
    * Import DB config directly.

### B. Service Layer (`backend/services/`)
**Role:** The "Brain" & Orchestrator.
* **DO:**
    * Manage Transactions: `connection.beginTransaction()`, `commit()`, `rollback()`.
    * **Audit Logging:** Log every data change.
    * **Validation:** Validate business rules and throw standard Errors.
    * **Transformation:** Convert DB `snake_case` results to `camelCase` for the Controller.
    * Add JSDoc for every function.

### C. Controller Layer (`backend/controllers/`)
**Role:** HTTP Interface.
* **DO:**
    * Parse requests.
    * **Validation:** Perform structural validation (e.g. valid email, numeric quantity) BEFORE calling Services.
    * Call Services.
    * Return standardized JSON responses.
    * Catch Service errors and map to HTTP Codes (400, 404, 500).
* **DO NOT:**
    * Write ANY SQL queries.
    * Contain complex business logic.

---

## 3. SINGLE SOURCE OF TRUTH (CRITICAL)
The Agent **MUST** read these files before generating code to prevent hallucinations.

| Context Type | File Path | Instruction |
| :--- | :--- | :--- |
| **DB Schema** | `.agent/context/schema.sql` | **READ FIRST.** Verify table names, columns, types, and FKs before writing SQL. |
| **API Contract** | `.agent/context/api_docs.md` | Ensure Controllers output JSON matching these contracts. |
| **Business Logic** | `.agent/context/architecture.md` | Check specific WMS rules (e.g., FIFO, Stock validation). |

---

## 4. CODE STYLE & CONVENTIONS
* **Language:** JavaScript (ESM). No TypeScript.
* **Documentation:** **JSDoc is Mandatory** for all Repository and Service functions.
* **Guard Clauses:** Use early returns to avoid deep nesting.
* **Naming Conventions:**
    * **Database Columns:** `snake_case` (e.g., `is_active`, `created_at`)
    * **JS Variables:** `camelCase` (e.g., `isActive`, `createdAt`)
    * **Files:** `camelCase` (e.g., `productService.js`)

---

## 5. API RESPONSE STRUCTURE
All Controllers **MUST** return JSON in this exact format.

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

**Success:**
```json
{
  "success": false,
  "message": "Error description",
  "error_code": "VALIDATION_ERROR"
}
```


## 6. TESTING STRATEGY (JEST ESM ARCHITECTURE)
The project uses **Native ESM** with Jest. Standard CommonJS mocking (`jest.mock`) will **NOT** work.

### A. Environment Configuration
* **Flag:** Tests must run with `NODE_OPTIONS=--experimental-vm-modules`.
* **File Extension:** Test files must end in `.test.js`.

### B. Mocking Strategy (Strict ESM)
* **Method:** Use `jest.unstable_mockModule('module-name', factory)` **BEFORE** dynamic imports.
* **Pattern:**
    ```javascript
    // 1. Mock first
    await jest.unstable_mockModule('../repositories/userRepository.js', () => ({
      findUserByEmail: jest.fn(),
    }));

    // 2. Import module under test dynamically
    const { login } = await import('../services/authService.js');
    ```

### C. Isolation Rules
1.  **NO Real Database:** Never import the real DB config. Mock the DB Connection object entirely.
2.  **File System:** Mock `fs` and `fs/promises` to prevent creating junk files during tests.

### D. Path Resolution in Tests
* **Constraint:** When testing inside `backend/tests/`, imports from root configs/utils must use **`../` (one level up)**.
    * *Correct:* `import { db } from '../config/database.js';`
    * *Incorrect:* `../../config/database.js` (Do not traverse too far back).

---

## 7. WORKER SYSTEM (CLI & BACKGROUND JOBS)
**Context:** Shared hosting has strict HTTP timeouts. Heavy processes (e.g., Payroll calculation, Stock Opname) **MUST** run as CLI scripts, not HTTP requests.

### A. Execution Context
* **Entry Point:** All workers reside in `backend/scripts/workers/`.
* **Trigger:** Executed via CRON jobs or Node.js `child_process` spawned by the Controller.

### B. Path Safety (CRITICAL)
**Problem:** Relative paths (`./file`) break in CRON/Worker environments because the `cwd` (Current Working Directory) varies.
**Rule:** Always construct absolute paths using `path.resolve` or `import.meta.url`.

* **DO NOT:**
    ```javascript
    const file = fs.readFileSync('./data/export.csv'); // WILL FAIL
    ```
* **DO:**
    ```javascript
    import path from 'path';
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const filePath = path.resolve(__dirname, '../../storage/exports/data.csv');
    ```

### C. Testing Workers
* Since workers use absolute paths, assertions in Jest must use loose matching:
    * **Use:** `expect(path).toEqual(expect.stringContaining('backend/storage'))`
    * **Avoid:** Hardcoded full paths.

---

## 8. DEPENDENCY MANAGEMENT (STRICT)
**Context:** To prevent bloat, security risks, and compatibility issues, no new packages should be added without explicit approval.

### A. No Silent Installs
* **Rule:** The Agent **MUST NOT** install any new NPM package (e.g., `npm install x`) without first asking for permission.
* **Procedure:**
    1.  Check if an existing package can solve the problem (Read `package.json`).
    2.  If not, propose the new package with a justification.
    3.  Wait for user confirmation (Yes/No).

### B. Verification First
* **Proof of Awareness:** Before suggesting a new library, the Agent must prove it has read `package.json` to verify the library doesn't already exist or a similar one isn't available.