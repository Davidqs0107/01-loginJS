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
