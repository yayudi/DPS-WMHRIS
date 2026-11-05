---
trigger: glob
description: "Modern JavaScript & Frontend Utilities Standards"
globs: "**/*.js"
---

# MODERN JAVASCRIPT & UTILITIES STANDARDS

## 1. MODERN SYNTAX ENFORCEMENT (ES6+)
- **Variables:** STRICTLY forbid `var`. Use `const` by default, `let` only if reassignment is needed.
- **Functions:** Prefer Arrow Functions (`() => {}`) for callbacks and utilities. Use `function` keyword only for top-level declarations or when `this` context is required.
- **Async:** Always use `async/await`. Avoid `Promise.then().catch()` chains unless handling parallel streams.
- **Modules:** Use ES Modules (`import`/`export`) syntax. Avoid CommonJS (`require`) unless strictly working in a config file.

## 2. TYPE SAFETY (VIA JSDOC)
- **Soft-Typing:** For plain `.js` files (where TypeScript is not used), include JSDoc comments for complex function arguments:
  ```javascript
  /**
   * @param {string} userId
   * @param {number} amount
   * @returns {Promise<boolean>}
   */
  ```
