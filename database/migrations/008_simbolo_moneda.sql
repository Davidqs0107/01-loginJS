-- Migration: Símbolo de moneda configurable por empresa
-- Date: 2026-07-13
-- Description: 'moneda' (ISO) se conserva; se agrega 'simbolo_moneda' (visual).

ALTER TABLE configuracion_empresa
  ADD COLUMN IF NOT EXISTS simbolo_moneda text NOT NULL DEFAULT 'Bs.';

COMMENT ON COLUMN configuracion_empresa.simbolo_moneda IS 'Símbolo a mostrar en UI/PDF/email, ej: Bs., $, S/.';
