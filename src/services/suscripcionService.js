import { executeQuery, executeSelect } from "../helpers/queryS.js";

// Umbral (días) para considerar una suscripción "por vencer".
export const DIAS_POR_VENCER = 7;

/** Deriva el estado de la suscripción a partir de los días restantes. */
export const estadoSuscripcion = (diasRestantes) => {
    if (diasRestantes === null || diasRestantes === undefined) return 'sin_plan';
    if (diasRestantes < 0) return 'vencido';
    if (diasRestantes <= DIAS_POR_VENCER) return 'por_vencer';
    return 'vigente';
};

/**
 * Estado de suscripción de una empresa (su plan vigente = el de mayor fecha_fin).
 */
export const getSuscripcionEstadoService = async (empresa_id) => {
    const rows = await executeQuery(
        `SELECT ep.id AS empresa_plan_id, ep.fecha_inicio, ep.fecha_fin, ep.estado AS plan_estado,
                ep.plan_id, p.nombre AS plan_nombre, p.precio, p.duracion_dias,
                (ep.fecha_fin::date - CURRENT_DATE) AS dias_restantes
         FROM empresa_planes ep
         JOIN planes p ON ep.plan_id = p.id
         WHERE ep.empresa_id = $1
         ORDER BY ep.fecha_fin DESC
         LIMIT 1`,
        [empresa_id]
    );

    if (rows.length === 0) {
        return { empresa_id, estado: 'sin_plan', dias_restantes: null };
    }

    const r = rows[0];
    const dias_restantes = parseInt(r.dias_restantes, 10);
    return {
        empresa_id,
        plan_id: r.plan_id,
        plan_nombre: r.plan_nombre,
        precio: r.precio,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        dias_restantes,
        estado: estadoSuscripcion(dias_restantes),
    };
};

/**
 * Lista paginada de empresas con el estado de su suscripción (para el super_admin).
 * El estado y el orden por urgencia se calculan en la BD para poder paginar
 * correctamente. Filtro opcional por `estado` (vigente | por_vencer | vencido).
 *
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export const getSuscripcionesService = async ({ estado, page = 1, pageSize = 30 } = {}) => {
    // $1 = umbral "por vencer". El filtro por estado se agrega dinámicamente.
    const params = [DIAS_POR_VENCER];
    let filtroEstado = '';
    if (estado) {
        params.push(estado);
        filtroEstado = ` WHERE estado = $${params.length}`;
    }

    const query = `
        WITH ultimo_plan AS (
            SELECT DISTINCT ON (e.id)
                   e.id AS empresa_id, e.nombre AS empresa_nombre, e.estado AS empresa_estado,
                   ep.fecha_fin, p.nombre AS plan_nombre, p.precio,
                   (ep.fecha_fin::date - CURRENT_DATE) AS dias_restantes
            FROM empresas e
            JOIN empresa_planes ep ON ep.empresa_id = e.id
            JOIN planes p ON ep.plan_id = p.id
            ORDER BY e.id, ep.fecha_fin DESC
        ),
        con_estado AS (
            SELECT *,
                   CASE
                       WHEN dias_restantes < 0  THEN 'vencido'
                       WHEN dias_restantes <= $1 THEN 'por_vencer'
                       ELSE 'vigente'
                   END AS estado
            FROM ultimo_plan
        )
        SELECT * FROM con_estado ${filtroEstado}
        ORDER BY dias_restantes ASC`;

    const result = await executeSelect(query, params, parseInt(page), parseInt(pageSize));
    result.data = result.data.map((r) => ({
        ...r,
        empresa_id: Number(r.empresa_id),
        dias_restantes: parseInt(r.dias_restantes, 10),
    }));
    return result;
};
