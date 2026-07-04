-- Migration: Porción de mora en pagos + Arqueo de caja
-- Date: 2026-07-03
-- Description: Aditiva y retrocompatible. No modifica ni requiere datos previos.
--   - pagos.monto_mora: cuánto de cada pago se aplicó a la mora (default 0 => datos viejos intactos).
--   - arqueos: cierre de caja diario por cobrador (tabla nueva).

-- ─────────────────────────────────────────────
-- 1. Columna monto_mora en pagos (aditiva, default 0)
-- ─────────────────────────────────────────────
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto_mora numeric(15, 2) DEFAULT 0;
COMMENT ON COLUMN pagos.monto_mora IS 'Porción del pago aplicada a mora (el resto, en pagos.monto, va a la cuota)';

-- ─────────────────────────────────────────────
-- 2. Arqueo de caja (cierre diario por cobrador)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arqueos (
    id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id int8 NOT NULL,
    usuario_id int8 NOT NULL,                                  -- cobrador que cierra la caja
    fecha date NOT NULL,
    total_cobrado_sistema numeric(15, 2) NOT NULL DEFAULT 0,   -- calculado desde pagos (monto + monto_mora)
    total_entregado numeric(15, 2) NOT NULL DEFAULT 0,         -- declarado por el cobrador
    diferencia numeric(15, 2) NOT NULL DEFAULT 0,              -- total_entregado - total_cobrado_sistema
    estado text NOT NULL DEFAULT 'cerrado',                    -- cerrado | aprobado | rechazado
    nota text,
    aprobado_por int8,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT arqueos_estado_check CHECK (estado IN ('cerrado', 'aprobado', 'rechazado')),
    CONSTRAINT arqueos_empresa_usuario_fecha_key UNIQUE (empresa_id, usuario_id, fecha),
    CONSTRAINT arqueos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT arqueos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS arqueos_empresa_fecha_idx ON arqueos USING btree (empresa_id, fecha DESC);

COMMENT ON TABLE arqueos IS 'Cierre de caja diario por cobrador: cobrado (sistema) vs entregado (declarado)';
