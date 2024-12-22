import { notFoundError } from "../constants/notfound.constants.js";
import { crearPrestamoService, getPrestamosByIdService, getPrestamosServices, getPrestamosServicesByClientId, getPrestamosServicesByUserId } from "../services/prestamosServices.js";

export const getPrestamos = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getPrestamosServices({ page, pageSize, empresa_id });
        return res.status(200).json({
            ok: true,
            prestamos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getPrestamosServices:', error);
        res.status(500).json({ msg: 'Error al obtener los prestamos.' });
    }
}

export const getPrestamosById = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getPrestamosByIdService(id, empresa_id);
        return res.status(200).json({
            ok: true,
            prestamo: result,
        });
    } catch (error) {
        console.error('Error en getPrestamosById:', error);
        if (error.message === notFoundError.prestamoNotFound) {
            return res.status(404).json({ msg: notFoundError.prestamoNotFound });
        }
        res.status(500).json({ msg: 'Error al obtener el prestamo.' });
    }
}

export const getPrestamosByUserId = async (req, res) => {
    const { userId } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const { page = 1, pageSize = 10 } = req.query;
    try {
        const result = await getPrestamosServicesByUserId({ page, pageSize, id: userId, empresa_id });
        return res.status(200).json({
            ok: true,
            prestamos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getPrestamosServices:', error);
        res.status(500).json({ msg: 'Error al obtener los prestamos.' });
    }
}

export const getPrestamosByClientId = async (req, res) => {
    const { clientId } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const { page = 1, pageSize = 10 } = req.query;
    try {
        const result = await getPrestamosServicesByClientId({ page, pageSize, id: clientId, empresa_id });
        return res.status(200).json({
            ok: true,
            prestamos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getPrestamosServices:', error);
        res.status(500).json({ msg: 'Error al obtener los prestamos.' });
    }
}

export const crearPrestamo = async (req, res) => {
    const data = req.body;
    data.empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const { prestamo, cuotas } = await crearPrestamoService(data);
        // Lógica para crear un prestamo
        return res.status(201).json({
            ok: true,
            msg: 'Prestamo creado',
            prestamo,
            cuotas
        });
    } catch (error) {
        console.error('Error en crearPrestamo:', error);
        res.status(500).json({ msg: 'Error al crear el prestamo.' });
    }
}