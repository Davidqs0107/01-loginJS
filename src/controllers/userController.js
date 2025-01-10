/*
/api/user
*/
import { response } from "express"
import { pool } from "../db.js";
import bcrypt from 'bcrypt';
import { createUsuarioService, getUsuarioByIdService, getUsuariosCobradoresServices, getUsuariosServices, softDeleteUsuarioService, updateUsuarioService } from "../services/userServices.js";
import { userRol } from "../constants/usuarios.constants.js";
import { notFoundError } from "../constants/notfound.constants.js";

export const getUsuarios = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query; // Parámetros de paginación desde el cliente
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getUsuariosServices({ page, pageSize, empresa_id });

        res.status(200).json({
            ok: true,
            usuarios: result.data,
            meta: result.meta, // Metadatos de paginación
        });
    } catch (error) {
        if (error.message === notFoundError.noUsersFound) {
            return res.status(404).json({
                ok: false,
                msg: error.message,
            });
        }
        res.status(500).json({
            ok: false,
            msg: error.message,
        });
    }
};
export const getById = async (req, res = response) => {
    const { id } = req.params;
    try {
        const user = await getUsuarioByIdService(id);

        return res.status(200).json({
            ok: true,
            usuario: { ...user }
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error
        });
    }

}

export const createUsuario = async (req, res = response) => {

    const { nombre, apellido, email: emailnot, password, telefono, ci, rol = userRol.cobrador } = req.body;
    const empresa_id = req.empresa_id; // Obtenido del middleware, por ejemplo, del token
    const plan_id = req.plan_id || 1;
    const email = emailnot.toLowerCase();
    try {
        if (plan_id < 3) {
            const userExist = await getUsuariosCobradoresServices({ empresa_id });
            if (userExist.count > 0) return res.status(403).json({
                ok: false,
                msg: 'No puede crear mas usuarios con este plan'
            })
        }
        const newUser = await createUsuarioService({
            nombre,
            apellido,
            email,
            password,
            telefono,
            empresa_id,
            ci,
            rol
        });

        return res.status(201).json({
            ok: true,
            usuario: newUser,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error.message || "Error al crear usuario. Contacte al administrador.",
        });
    }
};

export const update = async (req, res = response) => {
    const { id } = req.params;
    const data = req.body;
    try {
        delete data.id;
        if (data.password) {
            data.password = bcrypt.hashSync(data.password, 10);
        }
        const updatedUser = await updateUsuarioService(id, data);
        return res.status(200).json({
            ok: true,
            usuario: updatedUser,
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error

        });
    }
}
export const updateCobrador = async (req, res = response) => {
    const { id } = req.params;
    const data = req.body;
    try {
        delete data.id;
        if (data.password) {
            data.password = bcrypt.hashSync(data.password, 10);
        }
        const updatedUser = await updateUsuarioService(id, data);
        return res.status(200).json({
            ok: true,
            usuario: updatedUser,
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: 'Contacte con el Administrador' + error

        });
    }
}
export const deleteUsuario = async (req, res) => {
    const { id } = req.params;

    try {
        const deletedUser = await deleteUsuarioService({ id });

        res.status(200).json({
            ok: true,
            msg: 'Usuario eliminado con éxito',
            usuario: deletedUser,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error.message || 'Error al eliminar el usuario',
        });
    }
};

export const softDeleteUsuario = async (req, res) => {
    const { id } = req.params;
    const { estado = true } = req.query;
    const userId = req.id; // Obtenido del middleware, por ejemplo, del token
    if (userId == id) {
        return res.status(500).json({
            ok: false,
            msg: 'No puede desactivar su propio usuario',
        });
    }
    try {
        const updatedUser = await softDeleteUsuarioService({ id }, estado);

        res.status(200).json({
            ok: true,
            msg: 'Usuario desactivado con éxito',
            usuario: updatedUser,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error.message || 'Error al desactivar el usuario',
        });
    }
};