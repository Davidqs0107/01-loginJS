-- Migration: Idempotencia de comprobantes del portal
-- Date: 2026-07-04
-- Description: Aditiva y retrocompatible.
--   - comprobantes_pago.request_id: id generado por el cliente para deduplicar
--     envíos duplicados (doble-click, reintento de red, etc.).
--   - Índice único por (cliente_id, request_id) que evita duplicados estrictos
--     cuando el cliente envía el mismo id. La unicidad es por cliente para que
--     dos clientes distintos puedan coincidir en su id sin colisionar.

ALTER TABLE comprobantes_pago
    ADD COLUMN IF NOT EXISTS request_id text;

-- Unicidad estricta solo cuando el id viene informado
CREATE UNIQUE INDEX IF NOT EXISTS comprobantes_request_id_uniq
    ON comprobantes_pago (cliente_id, request_id)
    WHERE request_id IS NOT NULL;

COMMENT ON COLUMN comprobantes_pago.request_id IS
    'Id generado por el cliente (UUID) para deduplicar envíos del portal. NULL permitido para compatibilidad.';
