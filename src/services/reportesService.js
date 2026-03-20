import { executeSelect, executeQuery, executeSelectOne } from '../helpers/queryS.js';

// ─────────────────────────────────────────
// ALTA PRIORIDAD
// ─────────────────────────────────────────

/**
 * Reporte 1: Mora Detallada
 * Lista todas las cuotas vencidas con días de mora, datos del cliente y cobrador.
 * Filtros opcionales: dias_mora_min, cobrador_id
 */
export const getReporteMoraService = async ({
    empresa_id,
    dias_mora_min,
    cobrador_id,
    page = 1,
    pageSize = 50,
}) => {
    const params = [empresa_id];
    let paramIdx = 2;
    let extraFilters = '';

    if (dias_mora_min) {
        extraFilters += ` AND (CURRENT_DATE - cu.fecha_pago) >= $${paramIdx}`;
        params.push(parseInt(dias_mora_min));
        paramIdx++;
    }

    if (cobrador_id) {
        extraFilters += ` AND u.id = $${paramIdx}`;
        params.push(parseInt(cobrador_id));
        paramIdx++;
    }

    const query = `
        SELECT
            c.nombre || ' ' || c.apellido       AS cliente,
            c.telefono,
            c.ci,
            c.direccion,
            p.id                                AS prestamo_id,
            cu.id                               AS cuota_id,
            cu.numero_cuota,
            cu.fecha_pago                       AS fecha_vencimiento,
            cu.monto                            AS monto_cuota,
            cu.monto_pagado,
            cu.monto - cu.monto_pagado          AS saldo_pendiente,
            CURRENT_DATE - cu.fecha_pago        AS dias_mora,
            u.nombre || ' ' || u.apellido       AS cobrador,
            u.id                                AS cobrador_id
        FROM cuotas cu
        JOIN prestamos p ON cu.prestamo_id = p.id
        JOIN clientes  c ON p.cliente_id   = c.id
        JOIN usuarios  u ON p.usuario_id   = u.id
        WHERE p.empresa_id = $1
            AND cu.estado IN ('pendiente', 'parcial')
            AND cu.fecha_pago < CURRENT_DATE
            AND c.estado = true
            ${extraFilters}
        ORDER BY dias_mora DESC, c.apellido ASC
    `;

    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};

/**
 * Reporte 2: Cartera por Estado
 * Resumen agrupado por estado del préstamo: capital prestado, saldo pendiente y total pagado.
 */
export const getReporteCarteraService = async ({ empresa_id }) => {
    const query = `
        SELECT
            sub.estado_prestamo,
            COUNT(sub.id)                           AS num_prestamos,
            COALESCE(SUM(sub.capital), 0)           AS capital_prestado,
            COALESCE(SUM(sub.saldo_pendiente), 0)   AS saldo_pendiente,
            COALESCE(SUM(sub.total_pagado), 0)      AS total_pagado
        FROM (
            SELECT
                p.id,
                p.estado_prestamo,
                p.monto AS capital,
                COALESCE(SUM(
                    CASE WHEN cu.estado IN ('pendiente', 'parcial')
                    THEN cu.monto - cu.monto_pagado ELSE 0 END
                ), 0) AS saldo_pendiente,
                COALESCE(SUM(cu.monto_pagado), 0) AS total_pagado
            FROM prestamos p
            LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
            WHERE p.empresa_id = $1
            GROUP BY p.id, p.estado_prestamo, p.monto
        ) sub
        GROUP BY sub.estado_prestamo
        ORDER BY sub.estado_prestamo
    `;

    return await executeQuery(query, [empresa_id]);
};

/**
 * Reporte 3: Cobros por Cobrador en un período
 * Total recaudado por cada cobrador (efectivo/QR) en el rango de fechas indicado.
 */
export const getReporteCobrosService = async ({ empresa_id, fecha_inicio, fecha_fin }) => {
    const query = `
        SELECT
            u.id                                                                        AS cobrador_id,
            u.nombre || ' ' || u.apellido                                               AS cobrador,
            u.telefono,
            COUNT(pag.id)                                                               AS num_pagos,
            COALESCE(SUM(pag.monto), 0)                                                 AS total_cobrado,
            COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'efectivo'), 0)       AS total_efectivo,
            COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'qr'), 0)             AS total_qr
        FROM usuarios u
        LEFT JOIN pagos pag ON pag.usuario_id = u.id
            AND pag.fecha_pago::date BETWEEN $2 AND $3
        WHERE u.empresa_id = $1
            AND u.rol = 'cobrador'
            AND u.estado = true
        GROUP BY u.id, u.nombre, u.apellido, u.telefono
        ORDER BY total_cobrado DESC
    `;

    return await executeQuery(query, [empresa_id, fecha_inicio, fecha_fin]);
};

// ─────────────────────────────────────────
// MEDIA PRIORIDAD
// ─────────────────────────────────────────

/**
 * Reporte 4: Agenda de Cobro
 * Cuotas pendientes/parciales que vencen entre hoy y los próximos N días.
 * Filtro opcional: cobrador_id (para cobrador se aplica automáticamente en el controller).
 */
export const getReporteAgendaService = async ({
    empresa_id,
    dias = 7,
    cobrador_id,
    page = 1,
    pageSize = 50,
}) => {
    const params = [empresa_id, parseInt(dias)];
    let cobradoreFilter = '';

    if (cobrador_id) {
        params.push(parseInt(cobrador_id));
        cobradoreFilter = `AND u.id = $${params.length}`;
    }

    const query = `
        SELECT
            c.nombre || ' ' || c.apellido   AS cliente,
            c.telefono,
            c.direccion,
            c.ci,
            cu.id                           AS cuota_id,
            cu.fecha_pago,
            cu.numero_cuota,
            cu.monto                        AS monto_cuota,
            cu.monto_pagado,
            cu.monto - cu.monto_pagado      AS monto_pendiente,
            cu.estado,
            p.id                            AS prestamo_id,
            u.nombre || ' ' || u.apellido   AS cobrador,
            u.id                            AS cobrador_id
        FROM cuotas cu
        JOIN prestamos p ON cu.prestamo_id = p.id
        JOIN clientes  c ON p.cliente_id   = c.id
        JOIN usuarios  u ON p.usuario_id   = u.id
        WHERE p.empresa_id = $1
            AND cu.estado IN ('pendiente', 'parcial')
            AND cu.fecha_pago BETWEEN CURRENT_DATE AND CURRENT_DATE + $2::int
            ${cobradoreFilter}
        ORDER BY cu.fecha_pago ASC, c.apellido ASC
    `;

    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};

/**
 * Reporte 5: Recaudación Mensual
 * Totales cobrados agrupados por mes en el rango indicado, desglosados por tipo de pago.
 */
export const getReporteRecaudacionService = async ({ empresa_id, fecha_inicio, fecha_fin }) => {
    const query = `
        SELECT
            TO_CHAR(DATE_TRUNC('month', pag.fecha_pago), 'YYYY-MM')                     AS mes,
            COUNT(DISTINCT p.id)                                                         AS prestamos_con_pagos,
            COUNT(pag.id)                                                                AS num_pagos,
            COALESCE(SUM(pag.monto), 0)                                                  AS total_cobrado,
            COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'efectivo'), 0)        AS total_efectivo,
            COALESCE(SUM(pag.monto) FILTER (WHERE pag.tipo_pago = 'qr'), 0)              AS total_qr
        FROM pagos pag
        JOIN cuotas    cu ON pag.cuota_id    = cu.id
        JOIN prestamos p  ON cu.prestamo_id  = p.id
        WHERE p.empresa_id = $1
            AND pag.fecha_pago::date BETWEEN $2 AND $3
        GROUP BY DATE_TRUNC('month', pag.fecha_pago)
        ORDER BY DATE_TRUNC('month', pag.fecha_pago) DESC
    `;

    return await executeQuery(query, [empresa_id, fecha_inicio, fecha_fin]);
};

/**
 * Reporte 6: Ficha del Cliente
 * Historial completo de préstamos y estado de cuotas de un cliente específico.
 */
export const getReporteFichaClienteService = async ({ empresa_id, cliente_id }) => {
    const clienteQuery = `
        SELECT id, nombre, apellido, telefono, email, ci, direccion
        FROM clientes
        WHERE id = $1 AND empresa_id = $2
    `;

    const prestamosQuery = `
        SELECT
            p.id                                AS prestamo_id,
            p.monto                             AS capital,
            p.tasa_interes,
            p.frecuencia_pago,
            p.total_cuotas                      AS total_cuotas_plan,
            p.fecha_inicio,
            p.estado_prestamo,
            p.tipo_prestamo,
            COUNT(cu.id)                        AS total_cuotas,
            COUNT(cu.id) FILTER (WHERE cu.estado = 'pagada')                            AS cuotas_pagadas,
            COUNT(cu.id) FILTER (WHERE cu.estado IN ('pendiente', 'parcial'))           AS cuotas_pendientes,
            COALESCE(SUM(cu.monto_pagado), 0)                                           AS total_pagado,
            COALESCE(SUM(cu.monto), 0)                                                  AS total_a_pagar,
            COALESCE(SUM(cu.monto - cu.monto_pagado)
                FILTER (WHERE cu.estado IN ('pendiente', 'parcial')), 0)                AS saldo_restante,
            u.nombre || ' ' || u.apellido       AS cobrador
        FROM prestamos p
        JOIN cuotas   cu ON cu.prestamo_id = p.id
        JOIN usuarios  u ON p.usuario_id   = u.id
        WHERE p.cliente_id = $1
            AND p.empresa_id = $2
        GROUP BY p.id, p.monto, p.tasa_interes, p.frecuencia_pago, p.total_cuotas,
                 p.fecha_inicio, p.estado_prestamo, p.tipo_prestamo, u.nombre, u.apellido
        ORDER BY p.fecha_inicio DESC
    `;

    const [clienteRows, prestamos] = await Promise.all([
        executeSelectOne(clienteQuery, [cliente_id, empresa_id]),
        executeQuery(prestamosQuery, [cliente_id, empresa_id]),
    ]);

    return { cliente: clienteRows[0] || null, prestamos };
};
