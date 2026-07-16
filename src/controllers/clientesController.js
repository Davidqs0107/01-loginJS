import { notFoundError } from "../constants/notfound.constants.js";
import { crearClienteService, getClienteByIdService, getClientesServices, searchClientesService, sofDeleteClientesService, updateClientesService } from "../services/clientesServices.js";
import { getScoreClienteService } from "../services/scoreService.js";
import { generarTokenPortalService, revocarTokenPortalService } from "../services/portalService.js";
import { normalizarPhoneCode } from "../helpers/phoneCode.js";

export const generarTokenPortal = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id;
    try {
        const token = await generarTokenPortalService(id, empresa_id);
        return res.status(200).json({ ok: true, portal_token: token, ruta: `/portal/${token}` });
    } catch ({ message }) {
        return res.status(400).json({ ok: false, msg: message });
    }
};

export const revocarTokenPortal = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id;
    try {
        await revocarTokenPortalService(id, empresa_id);
        return res.status(200).json({ ok: true, msg: 'Acceso al portal revocado.' });
    } catch ({ message }) {
        return res.status(400).json({ ok: false, msg: message });
    }
};

export const getScoreCliente = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const score = await getScoreClienteService(id, empresa_id);
        return res.status(200).json({ ok: true, score });
    } catch (error) {
        console.error('Error en getScoreCliente:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener el score del cliente.' });
    }
}

export const getClientes = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware

    try {
        const result = await getClientesServices({ page, pageSize, empresa_id });
        return res.status(200).json({
            ok: true,
            clientes: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getClientes:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener los clientes.' });
    }
}

export const getClienteById = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware

    try {
        const cliente = await getClienteByIdService(id, empresa_id);
        return res.status(200).json({
            ok: true,
            cliente: { ...cliente }
        });
    } catch (error) {
        console.error('Error en getClienteById:', error);
        if (error.message === notFoundError.clienteNotFound) {
            return res.status(404).json({ msg: 'Cliente no encontrado.' });
        }
        res.status(500).json({ msg: 'Error al obtener el cliente.' });
    }
}

export const crearCliente = async (req, res) => {
    const { nombre, apellido: apellidoNot, email: emailNot, telefono, direccion, ci, latitud, longitud, codigo_pais } = req.body;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const apellido = apellidoNot;
    const email = emailNot.toLowerCase();
    try {
        const newCliente = await crearClienteService({
            nombre,
            apellido,
            email,
            telefono,
            direccion,
            ci,
            latitud,
            longitud,
            codigo_pais: normalizarPhoneCode(codigo_pais),
            empresa_id
        });
        return res.status(201).json({
            ok: true,
            cliente: newCliente
        });
    } catch (error) {
        console.error('Error en crearCliente:', error);
        res.status(500).json({ msg: 'Error al crear el cliente.' });
    }
}

export const updateCliente = async (req, res) => {
    // Lógica para actualizar un cliente
    const { id } = req.params;
    const data = req.body;
    delete data.id; // Eliminar el ID del body
    if (data.codigo_pais !== undefined) {
        data.codigo_pais = normalizarPhoneCode(data.codigo_pais);
    }
    try {
        const updatedCliente = await updateClientesService(id, data);
        return res.status(200).json({
            ok: true,
            cliente: updatedCliente,
        });
    } catch (error) {
        console.error('Error en updateCliente:', error);
        res.status(500).json({ msg: 'Error al actualizar el cliente.' });

    }
}

export const softDeleteCliente = async (req, res) => {
    // Lógica para eliminar un cliente
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const { estado = true } = req.query;
    try {
        const updatedCliente = await sofDeleteClientesService({ id, empresa_id }, estado);
        return res.status(200).json({
            ok: true,
            cliente: updatedCliente,
        });
    } catch (error) {
        console.error('Error en softDeleteCliente:', error);
        res.status(500).json({ msg: 'Error al eliminar el cliente.' });
    }
}

export const searchClientes = async (req, res) => {
    const { q = '' } = req.query;
    const empresa_id = req.empresa_id;
    try {
        const clientes = await searchClientesService(q, empresa_id);
        return res.status(200).json({
            ok: true,
            clientes: clientes.data || clientes
        });
    } catch (error) {
        console.error('Error en searchClientes:', error);
        res.status(500).json({ ok: false, msg: 'Error al buscar clientes.' });
    }
}