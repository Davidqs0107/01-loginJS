import { notFoundError } from "../constants/notfound.constants.js";
import { buildDynamicQuery, buildQueryCreate, buildQueryUpdate, buildWhereClause } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeQuery, executeSelect, executeSelectOne } from "../helpers/queryS.js";

export const getClientesServices = async (data) => {
    const { page, pageSize, empresa_id } = data;
    try {
        const clientes = await executeSelect(
            'SELECT * FROM clientes WHERE empresa_id = $1 and estado=true',
            [empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return clientes;
    } catch (error) {
        throw error;
    }
};

export const getClienteByIdService = async (id, empresa_id) => {
    try {
        const cliente = await executeSelectOne('SELECT * From clientes where id = $1 and empresa_id = $2', [id, empresa_id]);
        if (cliente.length === 0) {
            throw new Error(notFoundError.clienteNotFound);
        }
        return cliente[0];
    } catch (error) {
        throw error;
    }
}

export const crearClienteService = async (data) => {
    const { empresa_id, ...otherData } = data;

    try {
        // Añadir siempre campos obligatorios
        const datos = { ...otherData, empresa_id };

        // Generar consulta dinámica
        const { campos, valores, placeholders } = buildDynamicQuery(datos);

        if (campos.length === 0) {
            throw new Error('No se enviaron campos para insertar');
        }

        const query = buildQueryCreate(campos, placeholders, 'clientes');

        const cliente = await executeInsert(query, valores);
        return cliente;
    } catch (error) {
        console.error('Error en crearClienteService:', error);
        throw error;
    }
}

export const updateClientesService = async (id, data) => {
    try {
        const { campos, valores, placeholders } = buildDynamicQuery(data);
        if (campos.length === 0) {
            throw new Error('No se enviaron campos para actualizar');
        }
        const query = buildQueryUpdate(campos, placeholders, 'clientes');
        valores.push(id);
        const empresa = await executeInsert(query, valores);
        return empresa;

    } catch (error) {
        console.error('Error en updateClientesService:', error);
        throw error;
    }
}

export const sofDeleteClientesService = async (conditions, estado) => {
    try {
        const { whereClause, valores } = buildWhereClause(conditions);
        const query = `
            UPDATE clientes
            SET estado = ${estado}
            WHERE ${whereClause}
            RETURNING *`;
        const updatedCliente = await executeQuery(query, valores);
        if (updatedCliente.length === 0) {
            throw new Error('No se encontró el cliente para desactivar');
        }

        return updatedCliente[0];

    } catch (error) {
        console.error('Error en sofDeleteClientesService:', error);
        throw error;
    }
}