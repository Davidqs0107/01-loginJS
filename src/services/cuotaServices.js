import { notFoundError } from "../constants/notfound.constants.js";
import { buildDynamicQuery, buildQueryUpdate } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeSelect, executeSelectOne } from "../helpers/queryS.js";

export const getCuotasServices = async (data) => {
    const { page, pageSize, empresa_id } = data;
    try {
        const cuotas = await executeSelect(
            `SELECT * FROM prestamos p join cuotas c 
            on p.id = c.prestamo_id
            WHERE p.empresa_id = $1`,
            [empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return cuotas;
    } catch (error) {
        throw error;
    }
}
export const getCuotasByIdService = async (id, empresa_id) => {
    try {
        const cuota = await executeSelectOne(
            `SELECT * FROM prestamos p join cuotas c 
            on p.id = c.prestamo_id
            WHERE c.id = $1 AND p.empresa_id = $2`,
            [id, empresa_id]
        );
        if (cuota.length === 0) {
            throw new Error(notFoundError.cuotaNotFound);
        }
        return cuota[0];
    } catch (error) {
        throw error;
    }
}
export const getCuotasByPrestamoIdService = async (data) => {
    const { page, pageSize, prestamo_id, empresa_id } = data;
    try {
        const cuotas = await executeSelect(
            `SELECT * FROM prestamos p join cuotas c 
            on p.id = c.prestamo_id
            WHERE p.id = $1 AND p.empresa_id = $2`,
            [prestamo_id, empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return cuotas;
    } catch (error) {
        throw error;
    }
}

export const getCuotasByUserIdServices = async (data) => {
    const { page, pageSize, id, empresa_id } = data;
    try {
        const cuotas = await executeSelect(
            `SELECT * FROM prestamos p join cuotas c 
            on p.id = c.prestamo_id
            WHERE p.usuario_id = $1 AND p.empresa_id = $2`,
            [id, empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return cuotas;
    } catch (error) {
        throw error;
    }
}

export const getCuotasByClientIdServices = async (data) => {
    const { page, pageSize, id, empresa_id } = data;
    try {
        const cuotas = await executeSelect(
            `SELECT * FROM prestamos p join cuotas c 
            on p.id = c.prestamo_id
            WHERE p.cliente_id = $1 AND p.empresa_id = $2`,
            [id, empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return cuotas;
    } catch (error) {
        throw error;
    }
}
export const updateCuotaService = async (id, data) => {
    const { campos, valores, placeholders } = buildDynamicQuery(data);
    if (campos.length === 0) {
        throw new Error('No se enviaron campos para actualizar');
    }
    const query = buildQueryUpdate(campos, placeholders, 'cuotas');
    valores.push(id);
    try {
        const prestamo = await executeInsert(query, valores);
        return prestamo;
    } catch (error) {
        throw error;
    }
}