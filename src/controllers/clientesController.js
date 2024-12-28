import { notFoundError } from "../constants/notfound.constants.js";
import { crearClienteService, getClienteByIdService, getClientesServices, sofDeleteClientesService, updateClientesService } from "../services/clientesServices.js";

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
    const { nombre, apellido: apellidoNot, email: emailNot, telefono, direccion, ci, latitud, longitud } = req.body;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const apellido = apellidoNot.toLowerCase();
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