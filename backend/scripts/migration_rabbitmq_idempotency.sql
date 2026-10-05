CREATE TABLE IF NOT EXISTS `processed_events` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` varchar(100) NOT NULL,
  `topic` varchar(100) NOT NULL,
  `processed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_event` (`event_id`, `topic`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
