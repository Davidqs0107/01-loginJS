import { notFoundError } from "../constants/notfound.constants.js";
import { buildDynamicQuery, buildWhereClause } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeQuery, executeSelect, executeSelectOne } from "../helpers/queryS.js";
import bcrypt from 'bcrypt';

export const getUsuariosServices = async (data) => {
    const { page = 1, pageSize = 10, empresa_id } = data;
    try {
        const users = await executeSelect(
            'SELECT * FROM usuarios WHERE empresa_id = $1 and estado=true',
            [empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        if (users.data.length === 0) {
            throw new Error(notFoundError.noUsersFound);
        }
        return users;
    } catch (error) {
        throw error;
    }

}

export const getUsuarioByIdService = async (id) => {
    try {
        const user = await executeSelectOne('SELECT * From usuarios where id = $1 and estado=true', [id]);
        if (user.length === 0) {
            throw new Error('Usuario no encontrado');
        }
        return user[0];
    } catch (error) {
        throw error;
    }
}

export const createUsuarioService = async (data) => {
    const { empresa_id, password: pass, ...otherData } = data;

    try {
        // Añadir siempre campos obligatorios
        const password = bcrypt.hashSync(pass, 10);

        const datos = { ...otherData, password, empresa_id };

        // Generar consulta dinámica
        const { campos, valores, placeholders } = buildDynamicQuery(datos);

        if (campos.length === 0) {
            throw new Error('No se enviaron campos para insertar');
        }

        const query = `
            INSERT INTO usuarios (${campos.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *`;

        const user = await executeInsert(query, valores);
        return user;
    } catch (error) {
        console.error('Error en createUsuarioService:', error);
        throw error;
    }
};

export const updateUsuarioService = async (id, data) => {
    try {
        const { campos, valores, placeholders } = buildDynamicQuery(data);

        if (campos.length === 0) {
            throw new Error('No se enviaron campos para actualizar');
        }

        // Generar consulta dinámica para UPDATE
        const setQuery = campos.map((campo, index) => `${campo} = ${placeholders[index]}`).join(', ');

        const query = `
            UPDATE usuarios
            SET ${setQuery}
            WHERE id = $${placeholders.length + 1}
            RETURNING *`;

        valores.push(id); // Agregar ID al final para la condición WHERE

        const user = await executeInsert(query, valores); // Reutilizar executeInsert
        return user;
    } catch (error) {
        console.error('Error en updateUsuarioService:', error);
        throw error;
    }
};

export const deleteUsuarioService = async (conditions) => {
    try {
        const { whereClause, valores } = buildWhereClause(conditions);

        if (!whereClause) {
            throw new Error('No se proporcionaron condiciones para eliminar');
        }

        const query = `
            DELETE FROM usuarios
            WHERE ${whereClause}
            RETURNING *`;

        const deletedUser = await executeQuery(query, valores);
        if (deletedUser.length === 0) {
            throw new Error('No se encontró el usuario para eliminar');
        }

        return deletedUser[0];
    } catch (error) {
        console.error('Error en deleteUsuarioService:', error);
        throw error;
    }
};

export const softDeleteUsuarioService = async (conditions, estado) => {
    try {
        const { whereClause, valores } = buildWhereClause(conditions);

        if (!whereClause) {
            throw new Error('No se proporcionaron condiciones para eliminar');
        }

        const query = `
            UPDATE usuarios
            SET estado = ${estado}
            WHERE ${whereClause}
            RETURNING *`;

        const updatedUser = await executeQuery(query, valores);
        if (updatedUser.length === 0) {
            throw new Error('No se encontró el usuario para desactivar');
        }

        return updatedUser[0];
    } catch (error) {
        console.error('Error en softDeleteUsuarioService:', error);
        throw error;
    }
};