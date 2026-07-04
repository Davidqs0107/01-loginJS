import { executeQuery } from "../helpers/queryS.js";

/**
 * Calcula el "semáforo" crediticio de un cliente a partir de su historial de
 * préstamos y cuotas dentro de la empresa (no cruza datos entre empresas).
 *
 *  - rojo:     tiene préstamos incumplidos o mora >= 30 días
 *  - amarillo: tiene cuotas vencidas con atraso leve (< 30 días)
 *  - verde:    al día
 *  - sin_historial: no tiene préstamos aún
 *
 * @returns {Promise<object>} { cliente_id, semaforo, metricas }
 */
export const getScoreClienteService = async (cliente_id, empresa_id) => {
    const rows = await executeQuery(
        `SELECT
            COUNT(DISTINCT p.id)                                                        AS prestamos_totales,
            COUNT(DISTINCT p.id) FILTER (WHERE p.estado_prestamo = 'incumplido')        AS prestamos_incumplidos,
            COUNT(DISTINCT p.id) FILTER (WHERE p.estado_prestamo = 'completado')        AS prestamos_completados,
            COUNT(cu.id)                                                                AS total_cuotas,
            COUNT(cu.id) FILTER (WHERE cu.estado = 'pagada')                            AS cuotas_pagadas,
            COUNT(cu.id) FILTER (
                WHERE cu.estado IN ('pendiente', 'parcial') AND cu.fecha_pago < CURRENT_DATE
            )                                                                            AS cuotas_vencidas,
            COALESCE(MAX(CURRENT_DATE - cu.fecha_pago) FILTER (
                WHERE cu.estado IN ('pendiente', 'parcial') AND cu.fecha_pago < CURRENT_DATE
            ), 0)                                                                        AS max_dias_atraso,
            COUNT(cu.id) FILTER (
                WHERE cu.estado = 'pagada'
                  AND (SELECT MAX(pg.fecha_pago::date) FROM pagos pg WHERE pg.cuota_id = cu.id) <= cu.fecha_pago
            )                                                                            AS cuotas_pagadas_a_tiempo
         FROM prestamos p
         LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
         WHERE p.cliente_id = $1 AND p.empresa_id = $2`,
        [cliente_id, empresa_id]
    );

    const m = rows[0];
    const metricas = {
        prestamos_totales: parseInt(m.prestamos_totales, 10),
        prestamos_incumplidos: parseInt(m.prestamos_incumplidos, 10),
        prestamos_completados: parseInt(m.prestamos_completados, 10),
        total_cuotas: parseInt(m.total_cuotas, 10),
        cuotas_pagadas: parseInt(m.cuotas_pagadas, 10),
        cuotas_vencidas: parseInt(m.cuotas_vencidas, 10),
        max_dias_atraso: parseInt(m.max_dias_atraso, 10),
        cuotas_pagadas_a_tiempo: parseInt(m.cuotas_pagadas_a_tiempo, 10),
    };

    // Puntualidad: % de cuotas pagadas que se pagaron en fecha
    metricas.puntualidad_pct = metricas.cuotas_pagadas > 0
        ? Math.round((metricas.cuotas_pagadas_a_tiempo / metricas.cuotas_pagadas) * 100)
        : null;

    let semaforo;
    if (metricas.prestamos_totales === 0) {
        semaforo = 'sin_historial';
    } else if (metricas.prestamos_incumplidos > 0 || metricas.max_dias_atraso >= 30) {
        semaforo = 'rojo';
    } else if (metricas.cuotas_vencidas > 0) {
        semaforo = 'amarillo';
    } else {
        semaforo = 'verde';
    }

    return { cliente_id: parseInt(cliente_id, 10), semaforo, metricas };
};
