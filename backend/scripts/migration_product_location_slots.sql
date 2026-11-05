-- Migration: Locational Metadata (Product Location Slots & Movement Logs)
-- Date: 2026-10-24
-- Description: Adds product_location_slots and product_location_slot_logs tables for Ruang-Rak-Tingkat slotting coordinates and audit trail.

CREATE TABLE IF NOT EXISTS `product_location_slots` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` INT UNSIGNED NOT NULL,
  `location_id` INT UNSIGNED NOT NULL COMMENT 'FK ke locations (Lantai/Lokasi)',
  `room` VARCHAR(50) NOT NULL COMMENT 'Nama/Kode Ruang (pengganti lorong)',
  `rack` VARCHAR(50) NOT NULL COMMENT 'Kode Rak/Ambalan',
  `tier` VARCHAR(30) DEFAULT NULL COMMENT 'Tingkat/Level/Ambalan/Bin (Opsional)',
  `formatted_coordinate` VARCHAR(150) NOT NULL COMMENT 'e.g. R.UTAMA - B-02 - T3',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Rak Utama/Picking, 0 = Rak Cadangan/Buffer',
  `updated_by` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pls_prod_loc` (`product_id`, `location_id`),
  KEY `idx_pls_location` (`location_id`),
  CONSTRAINT `fk_pls_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pls_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Slotting koordinat ambalan aktif per produk dan lantai (multi-rak)';

CREATE TABLE IF NOT EXISTS `product_location_slot_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` INT UNSIGNED NOT NULL,
  `location_id` INT UNSIGNED NOT NULL,
  `action` VARCHAR(50) NOT NULL COMMENT 'INITIAL_ASSIGN, ADDED, MOVED, REMOVED, CLEARED',
  `from_coordinate` VARCHAR(150) DEFAULT NULL,
  `to_coordinate` VARCHAR(150) DEFAULT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  `user_id` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_slot_logs_prod_loc` (`product_id`, `location_id`),
  KEY `idx_slot_logs_created` (`created_at`),
  CONSTRAINT `fk_psl_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_psl_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail riwayat perpindahan koordinat rak produk';
