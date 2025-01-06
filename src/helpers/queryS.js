import { pool } from '../db.js';

/**
 * Realiza una consulta SELECT genérica con soporte de paginación.
 * Maneja el cliente y asegura su liberación.
 * @param {string} query - La consulta SQL base (sin LIMIT ni OFFSET).
 * @param {Array} params - Los parámetros para la consulta.
 * @param {number} page - Número de la página (por defecto, 1).
 * @param {number} pageSize - Cantidad de elementos por página (por defecto, 10).
 * @returns {Promise<any>} - Los resultados de la consulta con metadatos de paginación.
 */
export const executeSelect = async (query, params = [], page = 1, pageSize = 10) => {
    const client = await pool.connect(); // Obtener el cliente del pool
    try {
        // Calculamos el OFFSET
        const offset = (page - 1) * pageSize;

        // Añadimos LIMIT y OFFSET a la consulta
        const paginatedQuery = `${query} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        // Ejecutamos la consulta con los parámetros
        const { rows } = await client.query(paginatedQuery, [...params, pageSize, offset]);

        // Obtenemos el total de registros (sin paginación)
        const countQuery = `SELECT COUNT(*) FROM (${query}) AS total_count`;
        const countResult = await client.query(countQuery, params);
        const totalItems = parseInt(countResult.rows[0].count, 10);

        return {
            data: rows,
            meta: {
                totalItems,
                page,
                pageSize,
                totalPages: Math.ceil(totalItems / pageSize),
            },
        };
    } catch (error) {
        console.error('Error en SELECT con paginación:', error);
        throw new Error('Error al realizar la consulta con paginación.');
    } finally {
        client.release(); // Liberar el cliente en cualquier caso
    }
};

/**
 * Realiza una consulta INSERT genérica en la base de datos.
 * Maneja el cliente y asegura su liberación.
 * @param {string} query - La consulta SQL.
 * @param {Array} params - Los parámetros para la consulta.
 * @returns {Promise<any>} - El registro recién creado.
 */
export const executeInsert = async (query, params = []) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(query, params);
        return rows[0]; // Retorna el primer registro, típico para INSERT con RETURNING
    } catch (error) {
        console.error('Error en :', error);
        throw new Error('Error en datos.' + error);
    } finally {
        client.release(); // Liberar el cliente
    }
};

/**
 * Realiza una consulta SELECT genérica en la base de datos.
 * @param {string} query - La consulta SQL.
 * @param {Array} params - Los parámetros para la consulta.
 * @returns {Promise<any>} - Los resultados de la consulta.
 */
export const executeSelectOne = async (query, params = []) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(query, params);
        return rows;
    } catch (error) {
        console.error('Error en SELECT:', error);
        throw new Error('Error al realizar la consulta.');
    } finally {
        client.release();
    }
};

export const executeQuery = async (query, values = []) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(query, values);
        return rows;
    } catch (error) {
        console.error('Error en executeQuery:', error);
        throw error;
    } finally {
        client.release();
    }
};
