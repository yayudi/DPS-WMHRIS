---
name: kelja-sync
description: Runbook and verification workflow for implementing or debugging Golang WMS <-> Kelja.id synchronization (RabbitMQ fulfillment events, idempotency, stock reservation, and REST API slotting metadata).
---

# Kelja.id & Golang WMS Synchronization Skill

Use this skill when implementing, auditing, or debugging integration flows between **DPS-WMHRIS (Golang Backend)** and **Kelja.id (ERP / Marketplace Connector)**.

## 1. Authoritative Architecture References
1. **Fulfillment & Event Bus Flow:** [docs/wms_kelja_fulfillment_flow.md](../../../docs/wms_kelja_fulfillment_flow.md)
   - Inbound RabbitMQ topics: `inventory.stock.decreased` (order deduction) and `inventory.stock.returned` (cancellation/return to `QA`/`RETUR`).
   - Outbound RabbitMQ event: `InventoryFulfilled`.
   - **Strict Idempotency:** Every inbound consumer (`stock_consumer.go`) MUST insert `(event_id, topic)` into `processed_events` first and gracefully skip duplicates.
   - **Stock Balance Separation:** Order arrival increments `reserved_quantity` (keeping physical `quantity` intact via Greedy `DISPLAY` location allocation). Physical `quantity` is only deducted and `reserved_quantity` released atomically (`WithTransaction`) upon picking completion.
2. **Locational Metadata & Slotting Pull API:** [docs/wms_locational_metadata_slotting_master_plan.md](../../../docs/wms_locational_metadata_slotting_master_plan.md)
   - Coordinate format: `Ruang - Rak - Tingkat` (e.g., `R.UTAMA - B-02 - T3`) stored in `product_location_slots` with audit history in `product_location_slot_logs`.
   - Accounting balance remains locked at the Floor/Location level (`stock_locations`).
3. **Manual Replenishment Flow:** [docs/wms_manual_replenishment_master_plan.md](../../../docs/wms_manual_replenishment_master_plan.md)

## 2. MCP Verification Checklist
When building or troubleshooting a Kelja.id synchronization feature:
1. **Verify DB State (`mysql` MCP):**
   - Inspect live table structures and rows in `db_wms_dev` (`processed_events`, `stock_locations`, `inv_transactions`, `inv_movements`, `inv_movement_lines`, `stock_movements`, `product_location_slots`).
2. **Verify API Contracts (`openapi` MCP):**
   - Use `openapi_search_endpoints` and `openapi_get_endpoint` to ensure REST payloads match the standard `{ success, message, data }` envelope.
   - If new endpoints are added to `docs/postman/DPS_WMHRIS.postman_collection.json`, regenerate `docs/openapi.json` via `python scripts/postman_to_openapi.py`.
3. **Verify Event Bus & Worker Health (`rabbitmq` & `docker` MCP):**
   - Check queue depth, exchange bindings, and Dead-Letter Queues (DLQ) via `rabbitmq` MCP.
   - Check `wms-service-dev-api` and `wms-service-dev-worker` container logs via `docker` MCP (`fetch_container_logs`).
4. **Verify Go Diagnostics (`gopls-mcp-server`):**
   - Run `go_diagnostics` on modified files in `backend/internal/modules/` and maintain 100% Hexagonal Architecture purity (`google/wire` DI, `TransactionManager`).

