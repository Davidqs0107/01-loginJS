-- Migration: Portal del cliente
-- Date: 2026-07-04
-- Description: Aditiva y retrocompatible.
--   - clientes.portal_token: token de acceso público al portal (NULL = sin acceso).
--   - comprobantes_pago: comprobantes que el cliente sube y el staff valida.

-- 1. Token de acceso al portal (nullable, único)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS portal_token text;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_portal_token_key') THEN
        ALTER TABLE clientes ADD CONSTRAINT clientes_portal_token_key UNIQUE (portal_token);
    END IF;
END $$;
COMMENT ON COLUMN clientes.portal_token IS 'Token de acceso público al portal del cliente (NULL = sin acceso)';

-- 2. Comprobantes de pago subidos por el cliente (pendientes de validación por el staff)
CREATE TABLE IF NOT EXISTS comprobantes_pago (
    id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id int8 NOT NULL,
    cliente_id int8 NOT NULL,
    prestamo_id int8,
    cuota_id int8,
    monto numeric(15, 2) NOT NULL,
    referencia text,                                   -- nro de transacción / nota del cliente
    archivo text,                                      -- ruta del comprobante subido (opcional)
    estado text NOT NULL DEFAULT 'pendiente',          -- pendiente | aprobado | rechazado
    pago_id int8,                                      -- pago generado al aprobar (si aplica)
    revisado_por int8,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comprobantes_pago_estado_check CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    CONSTRAINT comprobantes_pago_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT comprobantes_pago_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
CREATE INDEX IF NOT EXISTS comprobantes_empresa_estado_idx ON comprobantes_pago USING btree (empresa_id, estado);

COMMENT ON TABLE comprobantes_pago IS 'Comprobantes de pago subidos por el cliente desde el portal, a validar por el staff';
