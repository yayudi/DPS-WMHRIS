-- Migration: Fulfillment Source Configuration
-- Date: 2026-10-22
-- Description: Adds `is_fulfillment_source` flag to locations table for dynamic fulfillment routing.

-- 1. Tambah kolom flag pada tabel locations
ALTER TABLE locations
ADD COLUMN is_fulfillment_source TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Apakah lokasi ini menjadi sumber stok untuk fulfillment otomatis dari marketplace/Kelja';

-- 2. Migrasi data: tandai semua lokasi DISPLAY sebagai fulfillment source
UPDATE locations SET is_fulfillment_source = 1 WHERE purpose = 'DISPLAY';

-- 3. Perbaiki data inv_transactions yang menggunakan gedung fiktif BLD-A
UPDATE inv_transactions SET assigned_building = 'A12' WHERE assigned_building = 'BLD-A';

-- 4. Index untuk performa query fulfillment source
ALTER TABLE locations ADD INDEX idx_fulfillment_source (is_fulfillment_source, is_active);
