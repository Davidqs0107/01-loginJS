import { executeSelect } from "../helpers/queryS.js";

/**
 * Registra una acción sensible en la bitácora de auditoría.
 *
 * Es tolerante a fallos: si el registro de auditoría falla, se loguea el error
 * pero NO se propaga, para no romper la operación de negocio principal.
 *
 * Puede recibir un `client` de transacción para quedar dentro del mismo COMMIT
 * que la operación auditada; si no, usa `pool` directamente.
 *
 * @param {object} params
 * @param {import('pg').PoolClient} [params.client] - Cliente de transacción (opcional).
 * @param {number} params.empresa_id
 * @param {number} params.usuario_id
 * @param {string} params.accion - ej: 'eliminar_pago'
 * @param {string} params.entidad - ej: 'pago'
 * @param {number} [params.entidad_id]
 * @param {object} [params.datos_antes]
 * @param {object} [params.datos_despues]
 * @param {string} [params.ip]
 */
export const registrarAuditoria = async ({
    client,
    empresa_id,
    usuario_id,
    accion,
    entidad,
    entidad_id = null,
    datos_antes = null,
    datos_despues = null,
    ip = null,
}) => {
    const query = `
        INSERT INTO auditoria
            (empresa_id, usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues, ip)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    const params = [
        empresa_id,
        usuario_id,
        accion,
        entidad,
        entidad_id,
        datos_antes ? JSON.stringify(datos_antes) : null,
        datos_despues ? JSON.stringify(datos_despues) : null,
        ip,
    ];

    try {
        if (client) {
            await client.query(query, params);
        } else {
            const { pool } = await import("../db.js");
            await pool.query(query, params);
        }
    } catch (error) {
        console.error('⚠️ No se pudo registrar auditoría:', error.message);
    }
};

/**
 * Lista la bitácora de auditoría de una empresa, con filtros opcionales.
 */
export const getAuditoriaService = async ({ empresa_id, entidad, accion, page = 1, pageSize = 50 }) => {
    const params = [empresa_id];
    let filtros = '';

    if (entidad) {
        params.push(entidad);
        filtros += ` AND entidad = $${params.length}`;
    }
    if (accion) {
        params.push(accion);
        filtros += ` AND accion = $${params.length}`;
    }

    const query = `
        SELECT id, empresa_id, usuario_id, accion, entidad, entidad_id, datos_antes, datos_despues, ip, created_at
        FROM auditoria
        WHERE empresa_id = $1 ${filtros}
        ORDER BY created_at DESC`;

    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};
