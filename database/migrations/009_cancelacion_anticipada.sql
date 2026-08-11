-- Migration: Cancelación anticipada de préstamos de interés fijo
-- Date: 2026-08-10
-- Description: Aditiva e idempotente.
--   - configuracion_empresa.cancelacion_cuotas_interes: cantidad de cuotas de
--     interés que se cobran al cancelar anticipadamente un préstamo de tipo
--     'fijo'; el resto del interés pendiente se condona. Default 1.
--   - cuotas.estado admite el nuevo valor 'condonada' (cuota cuyo interés
--     pendiente fue perdonado en una cancelación anticipada).

BEGIN;

ALTER TABLE configuracion_empresa
    ADD COLUMN IF NOT EXISTS cancelacion_cuotas_interes int DEFAULT 1;

COMMENT ON COLUMN configuracion_empresa.cancelacion_cuotas_interes IS
    'Cantidad de cuotas de interés a cobrar al cancelar anticipadamente un préstamo de interés fijo; el resto se condona.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cuotas_estado_check') THEN
        ALTER TABLE cuotas DROP CONSTRAINT cuotas_estado_check;
    END IF;
    ALTER TABLE cuotas ADD CONSTRAINT cuotas_estado_check
        CHECK (estado = ANY (ARRAY['pendiente'::text, 'pagada'::text, 'parcial'::text, 'condonada'::text]));
END $$;

COMMIT;
