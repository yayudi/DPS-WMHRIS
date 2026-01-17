---
trigger: glob
description: **/*.vue
globs: **/*.vue
---

# VUE 3 WMS ARCHITECTURE & RULES

## 1. TECH STACK ENFORCEMENT
- **Core:** Vue 3 Composition API (`<script setup lang="ts">`).
- **State:** Pinia (No Vuex). Use Setup Stores pattern.
- **Styling:** Tailwind CSS. Avoid custom CSS classes unless necessary.
- **Data Fetching:** TanStack Query (Vue Query) or native fetch wrappers.

## 2. COMPONENT STRUCTURE
- **Naming:** PascalCase for filenames (e.g., `StockCard.vue`).
- **Props:** Use `defineProps<{ InterfaceName }>()` with Typescript interfaces.
- **Anti-Pattern:** DO NOT use Options API (`export default { data... }`).
- **Composables:** Extract heavy logic into `useStockLogic.ts` or `useInventory.ts`.

## 3. WMS BUSINESS LOGIC (CRITICAL)
- **Stock Validation:** Inventory quantity can NEVER be negative (`< 0`). Always add validation checks.
- **SKU Handling:** SKU must be treated as a case-insensitive unique string.
- **Dates:** Store dates in ISO-8601 UTC strings. Display in local time using strict format.
- **Currency:** Handle monetary values (prices) as integers/BigInt (cents) to avoid floating-point errors.

## 4. TOKEN EFFICIENCY (PARTIAL EDITING)
- **Script Updates:** If only logic changes, do NOT reprint the `<template>` or `<style>`. Use ``.
- **Template Updates:** If only UI changes, do NOT reprint the `<script>`. Use `// ...script unchanged`.
- **Imports:** Don't list all imports if adding just one. Use `import { NewFunc } from ...; // ...existing imports`.

## 5. UI/UX STANDARDS
- **Tables:** For data grids (stock lists), always implement pagination or virtualization.
- **Forms:** Use strict validation (Zod/VeeValidate) for stock input forms.
- **Feedback:** Show Toast/Alerts on successful stock movement (In/Out).

## 6. THEME & STYLING COMPLIANCE (STRICT)
**Context:** The application supports multiple themes (Light, Dark, Sepia, etc.). Fixed colors BREAK this feature.
- **PROHIBITED:**
  - Hardcoded Hex/RGB values (e.g., `#ffffff`, `rgb(0,0,0)`).
  - Standard Tailwind colors (e.g., `bg-secondary`, `text-gray-900`, `bg-blue-500`, `text-red-600`).
- **MANDATORY:**
  - Use Semantic Theme Classes defined in `tailwind.config.js`:
    - **Backgrounds:** `bg-background`, `bg-secondary` (for cards/modals).
    - **Text:** `text-text`, `text-muted` (if defined), `text-primary`.
    - **Actions:** `bg-primary`, `bg-accent`.
    - **Status:** `text-success`, `bg-danger/10` (Opacity modifiers are allowed).
  - **Borders:** `border-secondary`, `border-primary/20`.
- **Example:**
  - `class="bg-secondary text-black border-gray-200"` (WRONG)
  - `class="bg-background text-text border-secondary"` (CORRECT)