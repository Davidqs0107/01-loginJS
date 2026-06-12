-- Migration: Add max_usuarios column to planes table
-- Date: 2026-06-08
-- Description: Allows super admin to set user limits per plan

-- 1. Add max_usuarios column
ALTER TABLE planes ADD COLUMN max_usuarios INT DEFAULT NULL;
COMMENT ON COLUMN planes.max_usuarios IS 'NULL = unlimited users';

-- 2. Set default values based on existing plan IDs
-- Plan 1: 1 user max, Plan 2: 3 users max, Plan 3+: unlimited
UPDATE planes SET max_usuarios = 1 WHERE id = 1;
UPDATE planes SET max_usuarios = 3 WHERE id = 2;
UPDATE planes SET max_usuarios = NULL WHERE id >= 3;

-- 3. Verify
SELECT id, nombre, max_usuarios FROM planes;