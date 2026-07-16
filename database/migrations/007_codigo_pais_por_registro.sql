-- Migration: Código de país en teléfonos (por registro)
-- Date: 2026-07-13
-- Description: Cada empresa/usuario/cliente guarda su propio indicativo.
--              Default +591 (Bolivia) para preservar los datos existentes.

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS codigo_pais text NOT NULL DEFAULT '+591';

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS codigo_pais text NOT NULL DEFAULT '+591';

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS codigo_pais text NOT NULL DEFAULT '+591';

COMMENT ON COLUMN empresas.codigo_pais IS 'Indicativo telefónico, ej: +591, +52, +54';
COMMENT ON COLUMN usuarios.codigo_pais IS 'Indicativo telefónico, ej: +591, +52, +54';
COMMENT ON COLUMN clientes.codigo_pais IS 'Indicativo telefónico, ej: +591, +52, +54';
