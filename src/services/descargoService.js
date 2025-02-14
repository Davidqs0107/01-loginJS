import { buildDynamicQuery, buildQueryCreate } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeQuery, executeSelect } from "../helpers/queryS.js";

export const getDescargosServices = async (data) => {
    const { page, pageSize, empresa_id, fecha_inicio, fecha_fin, searchTerm } = data;
    try {

        let query = `SELECT d.*, u.nombre ,u.apellido ,u.ci ,u.email,u.telefono
        From descargos d join usuarios u 
        on d.usuario_id = u.id
        where d.empresa_id = $1
        and d.fecha between $2 and $3`;

        const queryParams = [empresa_id, fecha_inicio, fecha_fin];
        if (searchTerm) {
            // Si hay searchTerm, ignoramos las fechas
            query += ` AND (u.nombre ILIKE $4 OR u.apellido ILIKE $4
                        OR u.ci = $5
                        OR u.email ILIKE $4)`;
            queryParams.push(`%${searchTerm}%`, searchTerm);
        }
        query += ' ORDER BY d.fecha DESC';
        const descargos = await executeSelect(query, queryParams, parseInt(page, 10), parseInt(pageSize, 10));
        return descargos;
    } catch (error) {
        throw error;
    }
}
export const getDescargosServicesByUser = async (data) => {
    const { page, pageSize, empresa_id, id, fecha_inicio, fecha_fin } = data;
    try {
        const descargos = await executeSelect(
            `SELECT d.*,u.nombre ,u.apellido ,u.ci ,u.email,u.telefono
            From descargos d join usuarios u 
            on d.usuario_id = u.id 
            where d.empresa_id = $1 and d.usuario_id = $2
            and d.fecha between $3 and $4 ORDER BY d.fecha DESC`,
            [empresa_id, id, fecha_inicio, fecha_fin],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return descargos;
    } catch (error) {
        throw error;
    }
}
export const crearDescargoService = async (data) => {
    try {
        const { campos, valores, placeholders } = buildDynamicQuery(data);
        if (campos.length === 0) {
            throw new Error('No se enviaron campos para insertar');
        }
        const query = buildQueryCreate(campos, placeholders, 'descargos');
        const descargo = await executeInsert(query, valores);
        return descargo;
    } catch (error) {
        console.error('Error en crear Descargo:', error);
        throw error;
    }
}

export const aprobarDescargoService = async (data) => {
    try {
        const { id, estado } = data;
        const descargo = await executeQuery(
            `UPDATE descargos SET estado = $2 WHERE id = $1 returning *`,
            [id, estado]
        );
        // Lógica de aprobación de descargo
        return { ...descargo[0] };
    } catch (error) {
        throw error;
    }
}