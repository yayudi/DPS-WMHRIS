-- Migration: Localization & User Preferences (Phase 1)
-- Date: 2026-11-03
-- Description: Creates localization_locales, user_preferences, localization_translations tables, seeds active locales, and backfills existing users.

-- 1. Table: localization_locales
CREATE TABLE IF NOT EXISTS `localization_locales` (
  `code` VARCHAR(10) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Kode ISO: id-ID, en-US',
  `name` VARCHAR(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Nama tampilan: Bahasa Indonesia, English',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Increment setiap kali ada data terjemahan berubah (ETag buster)',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Daftar bahasa yang didukung';

-- 2. Initial Seed for localization_locales
INSERT INTO `localization_locales` (`code`, `name`, `is_default`, `is_active`, `version`)
VALUES 
  ('id-ID', 'Bahasa Indonesia', 1, 1, 1),
  ('en-US', 'English', 0, 1, 1)
ON DUPLICATE KEY UPDATE 
  `name` = VALUES(`name`),
  `is_default` = VALUES(`is_default`),
  `is_active` = VALUES(`is_active`);

-- 3. Table: user_preferences
CREATE TABLE IF NOT EXISTS `user_preferences` (
  `user_id` INT UNSIGNED NOT NULL,
  `locale` VARCHAR(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'id-ID' COMMENT 'ISO code: id-ID, en-US, zh-CN',
  `theme` VARCHAR(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'light' COMMENT 'Technical constant: light, dark, system',
  `timezone` VARCHAR(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Asia/Jakarta' COMMENT 'IANA timezone',
  `date_format` VARCHAR(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'YYYY-MM-DD' COMMENT 'Format pola tampilan tanggal',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_user_preferences_locale` (`locale`),
  CONSTRAINT `fk_user_preferences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_preferences_locale` FOREIGN KEY (`locale`) REFERENCES `localization_locales` (`code`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Preferensi antarmuka dan regional masing-masing user';

-- 4. Table: localization_translations
CREATE TABLE IF NOT EXISTS `localization_translations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `locale_code` VARCHAR(10) COLLATE utf8mb4_general_ci NOT NULL,
  `module` VARCHAR(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Domain: common, auth, wms, hris, system, errors',
  `translation_key` VARCHAR(150) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Key spesifik modul (tanpa module prefix): btn.save, stock.nonzero',
  `translation_value` TEXT COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_locale_module_key` (`locale_code`, `module`, `translation_key`),
  INDEX `idx_locale_module` (`locale_code`, `module`),
  CONSTRAINT `fk_loc_translations_locale` FOREIGN KEY (`locale_code`) REFERENCES `localization_locales` (`code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Kamus data terjemahan teks dinamis';

-- 5. Backfill user_preferences for all existing users (relying on column defaults)
INSERT INTO `user_preferences` (`user_id`)
SELECT `id` FROM `users`
ON DUPLICATE KEY UPDATE `user_preferences`.`updated_at` = `user_preferences`.`updated_at`;

-- 6. Trigger: Auto-create user_preferences upon user insertion (relying on column defaults)
DROP TRIGGER IF EXISTS `trg_after_user_insert_preference`;

CREATE TRIGGER `trg_after_user_insert_preference`
AFTER INSERT ON `users`
FOR EACH ROW
BEGIN
  INSERT INTO `user_preferences` (`user_id`)
  VALUES (NEW.`id`)
  ON DUPLICATE KEY UPDATE `updated_at` = `updated_at`;
END;

-- 7. Seed Permission: system.localization.manage (RBAC)
INSERT INTO `permissions` (`name`, `description`, `group`)
SELECT 'system.localization.manage', 'Mengelola kamus bahasa dan terjemahan sistem', 'System'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'system.localization.manage');

INSERT IGNORE INTO `role_permission` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions` WHERE `name` = 'system.localization.manage';

-- 7. Seed Permission: system.localization.manage (RBAC)
INSERT INTO `permissions` (`name`, `description`, `group`)
SELECT 'system.localization.manage', 'Mengelola kamus bahasa dan terjemahan sistem', 'System'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE `name` = 'system.localization.manage');

INSERT IGNORE INTO `role_permission` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions` WHERE `name` = 'system.localization.manage';
