-- ============================================================
-- Bundle de migraciones (features v2): 002 -> 003 -> 004 -> 005 -> 006
-- Aditivo y retrocompatible. Envuelto en una transacción:
-- si algo falla, NO se aplica nada (rollback automático).
-- Generado el 2026-07-04.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- migrations/002_configuracion_y_auditoria.sql
-- ------------------------------------------------------------
-- Migration: Configuración por empresa + Bitácora de auditoría
-- Date: 2026-07-03
-- Description: Cimientos para mora, incumplimiento automático y trazabilidad.

-- ─────────────────────────────────────────────
-- 1. Configuración por empresa (mora, incumplimiento, moneda)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion_empresa (
    id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id int8 NOT NULL,
    -- Mora
    mora_activa bool DEFAULT false,
    mora_tipo text DEFAULT 'porcentaje_cuota',   -- porcentaje_diario_saldo | porcentaje_cuota | monto_fijo_dia
    mora_valor numeric(10, 2) DEFAULT 0,          -- % o monto según mora_tipo
    mora_dias_gracia int DEFAULT 0,               -- días de tolerancia antes de aplicar mora
    mora_tope numeric(15, 2) DEFAULT NULL,        -- tope máximo de mora por cuota (NULL = sin tope)
    -- Incumplimiento
    incumplido_dias int DEFAULT 90,               -- días de atraso para marcar el préstamo como incumplido
    -- General
    moneda text DEFAULT 'BOB',
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT configuracion_empresa_empresa_id_key UNIQUE (empresa_id),
    CONSTRAINT configuracion_empresa_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT configuracion_empresa_mora_tipo_check CHECK (mora_tipo IN ('porcentaje_diario_saldo', 'porcentaje_cuota', 'monto_fijo_dia'))
);

-- ─────────────────────────────────────────────
-- 2. Bitácora de auditoría (append-only)
-- ─────────────────────────────────────────────
-- Sin FK a usuarios/empresas: el registro histórico debe sobrevivir aunque se borren.
CREATE TABLE IF NOT EXISTS auditoria (
    id int8 GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id int8,
    usuario_id int8,
    accion text NOT NULL,          -- ej: 'eliminar_pago', 'condonar_mora', 'cambiar_plan'
    entidad text NOT NULL,         -- ej: 'pago', 'prestamo', 'usuario'
    entidad_id int8,
    datos_antes jsonb,
    datos_despues jsonb,
    ip text,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auditoria_empresa_idx ON auditoria USING btree (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_entidad_idx ON auditoria USING btree (entidad, entidad_id);

COMMENT ON TABLE configuracion_empresa IS 'Ajustes por empresa: mora, umbral de incumplimiento y moneda';
COMMENT ON TABLE auditoria IS 'Registro append-only de acciones sensibles (borrar pago, editar préstamo, etc.)';

-- ------------------------------------------------------------
-- migrations/003_mora_pago_y_arqueos.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- migrations/004_refinanciacion.sql
-- ------------------------------------------------------------
-- Migration: Refinanciación de préstamos
-- Date: 2026-07-04
-- Description: Aditiva y retrocompatible.
--   - prestamos.prestamo_padre_id: enlaza un préstamo con el que refinanció (NULL en los normales).
--   - Amplía el CHECK de estado_prestamo para admitir 'refinanciado' (ampliar un CHECK
--     no rechaza filas existentes, por lo que es seguro).

-- 1. Columna de trazabilidad (nullable, auto-referencia)
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS prestamo_padre_id int8 NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_prestamo_padre_id_fkey') THEN
        ALTER TABLE prestamos
            ADD CONSTRAINT prestamos_prestamo_padre_id_fkey
            FOREIGN KEY (prestamo_padre_id) REFERENCES prestamos(id);
    END IF;
END $$;

COMMENT ON COLUMN prestamos.prestamo_padre_id IS 'ID del préstamo que fue refinanciado para originar este (NULL si es un préstamo normal)';

-- 2. Ampliar el CHECK de estado_prestamo para incluir 'refinanciado'
ALTER TABLE prestamos DROP CONSTRAINT IF EXISTS chk_estado_prestamo;
ALTER TABLE prestamos ADD CONSTRAINT chk_estado_prestamo
    CHECK (estado_prestamo IN ('pendiente', 'activo', 'completado', 'incumplido', 'refinanciado'));

-- ------------------------------------------------------------
-- migrations/005_portal_cliente.sql
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- migrations/006_idempotencia_comprobantes.sql
-- ------------------------------------------------------------
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

COMMIT;
