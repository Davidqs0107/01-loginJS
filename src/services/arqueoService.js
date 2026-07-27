import { executeQuery, executeSelect } from "../helpers/queryS.js";

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Total realmente cobrado por un cobrador en una fecha (capital/interés + mora),
 * dentro de una empresa. Base para el arqueo de caja.
 */
const totalCobradoSistema = async (empresa_id, usuario_id, fecha) => {
    const rows = await executeQuery(
        `SELECT COALESCE(SUM(pg.monto + COALESCE(pg.monto_mora, 0)), 0) AS total,
                COUNT(pg.id) AS num_pagos
         FROM pagos pg
         JOIN cuotas cu ON pg.cuota_id = cu.id
         JOIN prestamos p ON cu.prestamo_id = p.id
         WHERE pg.usuario_id = $1 AND p.empresa_id = $2 AND pg.fecha_pago::date = $3`,
        [usuario_id, empresa_id, fecha]
    );
    return { total: round2(parseFloat(rows[0].total)), num_pagos: parseInt(rows[0].num_pagos, 10) };
};

/**
 * Resumen del día para el cobrador (previsualización antes de cerrar la caja):
 * cuánto registró el sistema que cobró.
 */
export const getResumenDiaService = async ({ empresa_id, usuario_id, fecha }) => {
    const { total, num_pagos } = await totalCobradoSistema(empresa_id, usuario_id, fecha);
    return { empresa_id, usuario_id, fecha, total_cobrado_sistema: total, num_pagos };
};

/**
 * Cierra la caja del cobrador para una fecha: calcula lo cobrado según el sistema,
 * lo compara con lo que el cobrador declara haber entregado y guarda la diferencia.
 * Idempotente por (empresa, cobrador, fecha); no permite re-cerrar un arqueo aprobado.
 */
export const cerrarArqueoService = async ({ empresa_id, usuario_id, fecha, total_entregado, nota }) => {
    const entregado = parseFloat(total_entregado);
    if (isNaN(entregado) || entregado < 0) {
        throw new Error("El total entregado debe ser un número válido (>= 0).");
    }

    // No permitir modificar un arqueo ya aprobado
    const existente = await executeQuery(
        `SELECT estado FROM arqueos WHERE empresa_id = $1 AND usuario_id = $2 AND fecha = $3`,
        [empresa_id, usuario_id, fecha]
    );
    if (existente.length > 0 && existente[0].estado === 'aprobado') {
        throw new Error("El arqueo de esa fecha ya fue aprobado y no puede modificarse.");
    }

    const { total } = await totalCobradoSistema(empresa_id, usuario_id, fecha);
    const diferencia = round2(entregado - total);

    const rows = await executeQuery(
        `INSERT INTO arqueos (empresa_id, usuario_id, fecha, total_cobrado_sistema, total_entregado, diferencia, estado, nota)
         VALUES ($1, $2, $3, $4, $5, $6, 'cerrado', $7)
         ON CONFLICT (empresa_id, usuario_id, fecha) DO UPDATE SET
            total_cobrado_sistema = EXCLUDED.total_cobrado_sistema,
            total_entregado       = EXCLUDED.total_entregado,
            diferencia            = EXCLUDED.diferencia,
            estado                = 'cerrado',
            nota                  = EXCLUDED.nota,
            updated_at            = CURRENT_TIMESTAMP
         RETURNING *`,
        [empresa_id, usuario_id, fecha, total, entregado, diferencia, nota ?? null]
    );
    return rows[0];
};

/**
 * Aprueba o rechaza un arqueo (acción de admin).
 */
export const resolverArqueoService = async ({ id, empresa_id, estado, aprobado_por }) => {
    if (!['aprobado', 'rechazado'].includes(estado)) {
        throw new Error("Estado inválido. Use 'aprobado' o 'rechazado'.");
    }
    const rows = await executeQuery(
        `UPDATE arqueos
         SET estado = $1, aprobado_por = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND empresa_id = $4
         RETURNING *`,
        [estado, aprobado_por, id, empresa_id]
    );
    if (rows.length === 0) {
        throw new Error("Arqueo no encontrado.");
    }
    return rows[0];
};

/**
 * Días con cobros registrados que todavía no tienen arqueo cerrado, por cobrador.
 * Alerta para el admin.
 */
export const getArqueosPendientesService = async ({ empresa_id }) => {
    // ponytail: ventana fija de 30 días — si algún día quieren histórico completo, parametrizar
    const rows = await executeQuery(
        `SELECT pg.usuario_id,
                u.nombre || ' ' || COALESCE(u.apellido,'') AS cobrador,
                COUNT(DISTINCT pg.fecha_pago::date) AS dias_pendientes,
                COALESCE(SUM(pg.monto + COALESCE(pg.monto_mora,0)), 0) AS total_sin_arquear,
                MIN(pg.fecha_pago::date) AS fecha_mas_antigua
         FROM pagos pg
         JOIN cuotas cu ON pg.cuota_id = cu.id
         JOIN prestamos p ON cu.prestamo_id = p.id
         JOIN usuarios u ON pg.usuario_id = u.id
         LEFT JOIN arqueos a ON a.empresa_id = p.empresa_id AND a.usuario_id = pg.usuario_id AND a.fecha = pg.fecha_pago::date
         WHERE p.empresa_id = $1
           AND pg.fecha_pago::date < CURRENT_DATE
           AND pg.fecha_pago::date >= CURRENT_DATE - INTERVAL '30 days'
           AND a.id IS NULL
         GROUP BY pg.usuario_id, u.nombre, u.apellido
         ORDER BY MIN(pg.fecha_pago::date)`,
        [empresa_id]
    );
    return rows.map((r) => ({
        ...r,
        dias_pendientes: parseInt(r.dias_pendientes, 10),
        total_sin_arquear: round2(parseFloat(r.total_sin_arquear)),
    }));
};

/**
 * Lista los arqueos de la empresa, con filtros opcionales por cobrador y rango de fechas.
 */
export const getArqueosService = async ({ empresa_id, usuario_id, fecha_inicio, fecha_fin, page = 1, pageSize = 30 }) => {
    const params = [empresa_id];
    let filtros = '';

    if (usuario_id) {
        params.push(usuario_id);
        filtros += ` AND a.usuario_id = $${params.length}`;
    }
    if (fecha_inicio) {
        params.push(fecha_inicio);
        filtros += ` AND a.fecha >= $${params.length}`;
    }
    if (fecha_fin) {
        params.push(fecha_fin);
        filtros += ` AND a.fecha <= $${params.length}`;
    }

    const query = `
        SELECT a.*, u.nombre || ' ' || COALESCE(u.apellido, '') AS cobrador
        FROM arqueos a
        JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.empresa_id = $1 ${filtros}
        ORDER BY a.fecha DESC, a.usuario_id`;

    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};
