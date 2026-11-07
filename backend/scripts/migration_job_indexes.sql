-- Migration: Optimize Background Job Queue Indexes
-- Description: Adds indexes on created_at and composite (user_id, id) for import_jobs and export_jobs
--              to prevent disk filesort and full table scan bottlenecks on staging/dev & production.

-- 1. Indexes for import_jobs
ALTER TABLE `import_jobs` ADD INDEX `idx_import_jobs_created_at` (`created_at`);
ALTER TABLE `import_jobs` ADD INDEX `idx_import_jobs_user_id_id` (`user_id`, `id` DESC);

-- 2. Indexes for export_jobs
ALTER TABLE `export_jobs` ADD INDEX `idx_export_jobs_created_at` (`created_at`);
ALTER TABLE `export_jobs` ADD INDEX `idx_export_jobs_user_id_id` (`user_id`, `id` DESC);

