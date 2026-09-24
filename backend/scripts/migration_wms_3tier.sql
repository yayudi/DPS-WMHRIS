-- 1. Tambahkan kolom reserved_quantity pada stock_locations
ALTER TABLE `stock_locations`
ADD COLUMN `reserved_quantity` int(11) NOT NULL DEFAULT 0 AFTER `quantity`;

-- 2. Buat tabel inv_transactions (Header)
CREATE TABLE `inv_transactions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_number` varchar(50) NOT NULL,
  `reference_type` varchar(50) NOT NULL COMMENT 'Misal: API_SHOPEE, API_OFFLINE',
  `reference_id` varchar(100) NOT NULL COMMENT 'ID atau Nomor Pesanan dari sistem eksternal',
  `assigned_building` varchar(50) NOT NULL COMMENT 'Kode gedung yang ditugaskan untuk memproses pesanan ini',
  `status` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, PROCESSING, COMPLETED, CANCELLED',
  `notes` text DEFAULT NULL,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_trx_number` (`transaction_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Buat tabel inv_movements (Demand)
CREATE TABLE `inv_movements` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` int(10) UNSIGNED NOT NULL,
  `product_id` int(10) UNSIGNED NOT NULL,
  `target_quantity` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, COMPLETED',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inv_movements_trx` (`transaction_id`),
  KEY `idx_inv_movements_prod` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Buat tabel inv_movement_lines (Eksekusi Fisik)
CREATE TABLE `inv_movement_lines` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `movement_id` int(10) UNSIGNED NOT NULL,
  `scanned_location_id` int(10) UNSIGNED NOT NULL,
  `qty_done` int(11) NOT NULL,
  `scanned_by` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inv_movement_lines_mov` (`movement_id`),
  KEY `idx_inv_movement_lines_loc` (`scanned_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
