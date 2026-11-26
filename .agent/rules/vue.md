---
trigger: glob
description: "Vue 3 & TypeScript Frontend Architecture, WMS Rules, and Semantic Theme Standards"
globs: "frontend/src/**/*.{vue,ts}"
---

# VUE 3 & TYPESCRIPT FRONTEND ARCHITECTURE RULES

## 1. TECH STACK & MODERN SYNTAX (ES6+ / TS)
- **Core:** Vue 3 Composition API (`<script setup lang="ts">`), strict TypeScript (avoid `any`).
- **State & Fetching:** Pinia Setup Stores (no Vuex) and TanStack Query (`@tanstack/vue-query`) via `{ http }` from `@/core/infrastructure/http.client`.
- **Syntax Discipline:**
  - **Variables:** Forbid `var`. Use `const` by default; use `let` only when reassignment is required.
  - **Functions & Async:** Prefer Arrow Functions (`() => {}`) for callbacks/utilities and `async/await` over `.then().catch()` chains.
  - **Modules:** Use ES Modules (`import`/`export`) exclusively.

## 2. COMPONENT & COMPOSABLE STRUCTURE
- **Naming:** `PascalCase` for component filenames (e.g., `StockCard.vue`), `camelCase` with `use` prefix for composables (e.g., `useStockLogic.ts`).
- **Props & Emits:** Use type-based `defineProps<PropsInterface>()` and `defineEmits<{ ... }>()`.
- **Anti-Pattern:** Never use Vue 2 Options API (`export default { data() ... }`).
- **Separation of Concerns:** Extract complex state, filtering, and API orchestration into composables (`composables/`) or stores (`application/`).

## 3. WMS BUSINESS & UI/UX STANDARDS
- **Stock Validation:** Inventory quantity can NEVER be negative (`< 0`). Validate inputs with Zod or explicit guards before submission.
- **SKU Handling:** Treat SKU as a case-insensitive unique identifier (trim whitespace).
- **Dates & Currency:** Store/transmit dates in ISO-8601 UTC and format for local display via `dayjs` / `formatters.ts`. Handle monetary values as integers to avoid floating-point drift.
- **Data Grids:** Always use pagination or virtualization (`@tanstack/vue-table` / `@tanstack/vue-virtual`) for stock/product tables and provide toast feedback on mutations.

## 4. THEME & STYLING COMPLIANCE (STRICT)
**Context:** The app supports 11 themes (`data-theme` in `main.css`: 5 light + 6 dark). Hardcoded palette colors break theme switching.
- **PROHIBITED:**
  - Hardcoded Hex/RGB values (`#ffffff`, `rgb(0,0,0)`) in templates/styles.
  - Static Tailwind neutral/brand surface classes (`bg-white`, `bg-slate-100`, `text-gray-900`, `text-black`, `border-gray-200`, `bg-blue-500`, `text-red-600`).
- **MANDATORY (8 Semantic Tokens from `tailwind.config.js`):**
  - **Surfaces:** `bg-background`, `bg-secondary` (or opacity variants like `bg-secondary/50` for cards/modals).
  - **Typography:** `text-text`, `text-text/60` (for muted/secondary text via opacity modifier), `text-primary`.
  - **Brand & Actions:** `bg-primary`, `bg-accent`, `text-accent`.
  - **Status:** `text-success`, `bg-success/10`, `text-warning`, `bg-warning/10`, `text-danger`, `bg-danger/10`.
  - **Borders & Focus:** `border-secondary`, `border-primary/20`, `ring-primary`.
- **Example:**
  - `class="bg-white text-black border-gray-200"` (WRONG)
  - `class="bg-background text-text border-secondary"` (CORRECT)
