import { executeQuery } from "../helpers/queryS.js";

/**
 * Marca como 'incumplido' los préstamos cuyo mayor atraso de cuota supera el
 * umbral configurado por su empresa (configuracion_empresa.incumplido_dias),
 * con 90 días por defecto si la empresa no tiene configuración.
 *
 * Solo afecta préstamos en estado 'pendiente' o 'activo' (no toca 'completado').
 *
 * @param {number} [empresaId] - Si se indica, solo procesa esa empresa (útil para pruebas).
 * @returns {Promise<{ afectados: number, ids: number[] }>}
 */
export const marcarPrestamosIncumplidosService = async (empresaId = null) => {
    const params = [];
    let filtroEmpresa = '';
    if (empresaId) {
        params.push(empresaId);
        filtroEmpresa = ` AND p.empresa_id = $${params.length}`;
    }

    const query = `
        UPDATE prestamos p
        SET estado_prestamo = 'incumplido', updated_at = CURRENT_TIMESTAMP
        FROM (
            SELECT cu.prestamo_id, MAX(CURRENT_DATE - cu.fecha_pago) AS max_atraso
            FROM cuotas cu
            WHERE cu.estado IN ('pendiente', 'parcial')
              AND cu.fecha_pago < CURRENT_DATE
            GROUP BY cu.prestamo_id
        ) m
        WHERE p.id = m.prestamo_id
          AND p.estado_prestamo IN ('pendiente', 'activo')
          AND m.max_atraso >= COALESCE(
              (SELECT ce.incumplido_dias FROM configuracion_empresa ce WHERE ce.empresa_id = p.empresa_id),
              90
          )
          ${filtroEmpresa}
        RETURNING p.id`;

    const rows = await executeQuery(query, params);
    return { afectados: rows.length, ids: rows.map((r) => Number(r.id)) };
};
