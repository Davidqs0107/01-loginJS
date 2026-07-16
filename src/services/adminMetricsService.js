import { executeQuery } from "../helpers/queryS.js";
import { DIAS_POR_VENCER } from "./suscripcionService.js";

/**
 * KPIs globales del superadmin: empresas, suscripciones (vigentes/por_vencer/vencidas),
 * MRR (suma de precios de planes activos), clientes totales, préstamos activos.
 */
export const getGlobalMetricsService = async () => {
    const query = `
        WITH ultimo_plan AS (
            SELECT DISTINCT ON (e.id)
                   e.id AS empresa_id,
                   (ep.fecha_fin::date - CURRENT_DATE) AS dias_restantes
            FROM empresas e
            JOIN empresa_planes ep ON ep.empresa_id = e.id
            ORDER BY e.id, ep.fecha_fin DESC
        ),
        estados AS (
            SELECT empresa_id,
                   CASE
                       WHEN dias_restantes < 0           THEN 'vencido'
                       WHEN dias_restantes <= $1          THEN 'por_vencer'
                       ELSE 'vigente'
                   END AS estado
            FROM ultimo_plan
        ),
        planes_vigentes AS (
            SELECT ep.empresa_id, p.precio
            FROM empresa_planes ep
            JOIN planes p ON ep.plan_id = p.id
            WHERE ep.fecha_fin::date >= CURRENT_DATE
        )
        SELECT
            (SELECT COUNT(*) FROM empresas)                                   AS total_empresas,
            (SELECT COUNT(*) FROM empresas WHERE estado = true)               AS empresas_activas,
            (SELECT COUNT(*) FROM estados WHERE estado = 'vigente')            AS suscripciones_vigentes,
            (SELECT COUNT(*) FROM estados WHERE estado = 'por_vencer')         AS suscripciones_por_vencer,
            (SELECT COUNT(*) FROM estados WHERE estado = 'vencido')            AS suscripciones_vencidas,
            (SELECT COUNT(*) FROM empresas WHERE id NOT IN (SELECT empresa_id FROM empresa_planes))
                                                                            AS empresas_sin_plan,
            (SELECT COALESCE(SUM(precio), 0) FROM planes_vigentes)            AS mrr,
            (SELECT COUNT(*) FROM clientes WHERE estado = true)               AS clientes_totales,
            (SELECT COUNT(*) FROM prestamos WHERE estado_prestamo IN ('pendiente', 'activo'))
                                                                            AS prestamos_activos`;
    const rows = await executeQuery(query, [DIAS_POR_VENCER]);
    return rows[0];
};

/**
 * Cantidad de empresas creadas por mes en los últimos 12 meses (incluye meses vacíos = 0).
 * Retorna: [{ mes: 'YYYY-MM', cantidad: number }, ...]
 */
export const getCrecimientoEmpresasService = async () => {
    const query = `
        WITH meses AS (
            SELECT TO_CHAR(date_trunc('month', (CURRENT_DATE - (n || ' months')::interval)), 'YYYY-MM') AS mes
            FROM generate_series(0, 11) n
        )
        SELECT m.mes,
               COALESCE(c.cantidad, 0)::int AS cantidad
        FROM meses m
        LEFT JOIN (
            SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS mes,
                   COUNT(*) AS cantidad
            FROM empresas
            WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
            GROUP BY 1
        ) c USING (mes)
        ORDER BY m.mes`;
    return await executeQuery(query);
};

/**
 * Cantidad de empresas agrupadas por plan (incluye planes sin empresas con 0).
 */
export const getDistribucionPlanesService = async () => {
    const query = `
        SELECT p.id AS plan_id,
               p.nombre AS plan_nombre,
               p.precio,
               COUNT(ep.id)::int AS cantidad
        FROM planes p
        LEFT JOIN empresa_planes ep ON p.id = ep.plan_id
        GROUP BY p.id, p.nombre, p.precio
        ORDER BY cantidad DESC, p.nombre ASC`;
    return await executeQuery(query);
};

/**
 * Top N empresas más recientes con métricas básicas (clientes, préstamos, plan actual).
 */
export const getEmpresasRecientesService = async (limit = 10) => {
    const query = `
        SELECT e.id,
               e.nombre,
               e.estado,
               e.created_at,
               p.nombre AS plan_nombre,
               p.precio AS plan_precio,
               (ep.fecha_fin::date - CURRENT_DATE) AS dias_restantes,
               (SELECT COUNT(*) FROM clientes WHERE empresa_id = e.id AND estado = true)::int AS clientes_count,
               (SELECT COUNT(*) FROM prestamos WHERE empresa_id = e.id AND estado_prestamo IN ('pendiente', 'activo'))::int AS prestamos_count
        FROM empresas e
        LEFT JOIN LATERAL (
            SELECT * FROM empresa_planes WHERE empresa_id = e.id ORDER BY fecha_fin DESC LIMIT 1
        ) ep ON true
        LEFT JOIN planes p ON ep.plan_id = p.id
        ORDER BY e.created_at DESC
        LIMIT $1`;
    return await executeQuery(query, [limit]);
};

/**
 * Top N suscripciones más críticas (por vencer primero, luego vigentes próximas, ordenadas por urgencia).
 * Incluye cálculo de estado.
 */
export const getSuscripcionesCriticasService = async (limit = 10) => {
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
        )
        SELECT *,
               CASE
                   WHEN dias_restantes < 0           THEN 'vencido'
                   WHEN dias_restantes <= $1          THEN 'por_vencer'
                   ELSE 'vigente'
               END AS estado
        FROM ultimo_plan
        WHERE dias_restantes <= $1
        ORDER BY dias_restantes ASC
        LIMIT $2`;
    return await executeQuery(query, [DIAS_POR_VENCER, limit]);
};
