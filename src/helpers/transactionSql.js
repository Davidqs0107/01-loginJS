import { pool } from '../db.js';

/**
 * Ejecuta una transacción en la base de datos PostgreSQL.
 * @param {Function} callback - Una función que recibe el cliente de la transacción.
 * @returns {Promise<any>} - El resultado de la transacción o un error si falla.
 */
export const executeTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        // Iniciar la transacción
        await client.query('BEGIN');

        // Ejecutar la lógica definida por el callback
        const result = await callback(client);

        // Confirmar la transacción
        await client.query('COMMIT');

        return result;
    } catch (error) {
        // Revertir la transacción en caso de error
        await client.query('ROLLBACK');
        console.error('Transaction error:', error);
        throw error;
    } finally {
        // Liberar el cliente
        client.release();
    }
};
