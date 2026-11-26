---
trigger: glob
description: "Golang DRY, Composition, Generics, and Error Handling Paradigms"
globs: "backend/**/*.go"
---

# GOLANG CODING PARADIGMS (DRY & REUSABILITY)

To maintain a clean, reusable, and DRY codebase in Golang, the Agent MUST adhere to the following paradigms:

## 1. COMPOSITION OVER INHERITANCE
* **Rule:** Never attempt to simulate OOP inheritance (e.g., base classes).
* **Practice:** Use **Struct Embedding** for shared fields.
* **Example:** Embed a `BaseEntity` struct (containing `ID`, `CreatedAt`, `UpdatedAt`) into specific business entity structs rather than duplicating these fields.

## 2. INTERFACES FOR ABSTRACTION (DUCK TYPING)
* **Rule:** Rely on implicit interfaces to decouple logic.
* **Practice:** Define small, focused interfaces (ideally 1-2 methods) where they are consumed, not where they are implemented. Pass interfaces as function parameters instead of concrete structs to maximize flexibility and ease of testing/mocking.

## 3. GENERICS FOR UTILITY FUNCTIONS
* **Rule:** Do not duplicate utility functions (like sorting, filtering, or pagination) for different struct types.
* **Practice:** Utilize Go 1.18+ **Generics** (`[T any]`) for utility packages and shared repository layers to handle generic data types efficiently without reflection.

## 4. HIGHER-ORDER FUNCTIONS
* **Rule:** Do not duplicate setup/teardown logic (e.g., DB Transactions, Context Timeout setup).
* **Practice:** Use higher-order functions (passing a function as an argument) to wrap repetitive tasks.
* **Example:** Use `s.txManager.WithTransaction(ctx, func(ctx context.Context) error { ... })` that automatically handles `Begin`, `Commit`, and `Rollback` to keep the core UseCase logic DRY.

## 5. EXPLICIT ERROR HANDLING (EXCEPTION TO DRY)
* **Rule:** The `if err != nil { return err }` block is **NOT** considered a violation of DRY.
* **Practice:** ALWAYS check for errors explicitly. Do not attempt to build "clever" wrappers or panics just to hide error checks. Verbose error handling is an intentional design choice in Go to ensure control flow clarity.
