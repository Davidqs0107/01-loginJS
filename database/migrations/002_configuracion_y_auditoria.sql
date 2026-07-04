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
