import { response } from "express";
import { notFoundError } from "../constants/notfound.constants.js";
import { crearPrestamoService, deleteFileService, getPrestamosByClientIdServices, getPrestamosByIdService, getPrestamosByUserIdServices, getPrestamosServices, getUploadFileService, updatePrestamoService, uploadFileService } from "../services/prestamosServices.js";
import { estadoPrestamo } from "../constants/commons.constans.js";
import { formatDateWithDateFns } from "../helpers/functions.js";

export const getPrestamos = async (req, res) => {
    const fecha = formatDateWithDateFns(new Date());
    const { page = 1, pageSize = 10, fecha_inicio = fecha, fecha_fin = fecha, searchTerm } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getPrestamosServices({ page, pageSize, empresa_id, fecha_inicio, fecha_fin, searchTerm });
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
    const { mostrarCuotas = false } = req.query;
    try {
        const result = await getPrestamosByIdService(id, empresa_id, mostrarCuotas);
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
        const result = await getPrestamosByUserIdServices({ page, pageSize, id: userId, empresa_id });
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
        const result = await getPrestamosByClientIdServices({ page, pageSize, id: clientId, empresa_id });
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
    data.usuario_id = req.id; // ID del usuario desde el middleware
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

export const updatePrestamo = async (req, res) => {
    const { id } = req.params;
    const { documento, estado_prestamo = estadoPrestamo.pendiente } = req.body;
    const data = {};
    data.empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    data.usuario_id = req.id; // ID del usuario desde el middleware
    data.documento = documento; // documento es un campo opcional
    data.estado_prestamo = estado_prestamo;
    try {
        // Lógica para actualizar un prestamo
        const prestamo = await updatePrestamoService(id, data);
        return res.status(200).json({
            ok: true,
            msg: 'Prestamo actualizado',
            prestamo
        });
    } catch (error) {
        console.error('Error en updatePrestamo:', error);
        res.status(500).json({ msg: 'Error al actualizar el prestamo.' });
    }
}

export const uploadFile = async (req, res = response) => {
    // Lógica para subir un archivo
    const { id } = req.params;

    // Validar si hay archivos en la solicitud
    if (!req.files || !req.files.archivo) {
        return res.status(400).json({ ok: false, error: 'No se envió ningún archivo' });
    }

    const archivo = req.files.archivo;

    try {
        // Lógica para subir un archivo
        const result = await uploadFileService(id, archivo);
        return res.status(200).json({
            ok: true,
            msg: 'Archivo subido',
            archivo: result
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

export const getUploadFile = async (req, res) => {
    // Lógica para obtener un archivo
    const { id } = req.params;
    try {
        // Lógica para obtener un archivo
        const archivo = await getUploadFileService(id);
        return res.status(200).json({
            ok: true,
            msg: 'Archivo obtenido',
            archivo: archivo
        });
    } catch (error) {
        console.error('Error en getUploadFile:', error);
        res.status(500).json({ msg: 'Error al obtener el archivo.' });
    }
}


export const deleteFile = async (req, res = response) => {
    const { id, archivoId } = req.params;

    try {
        // Llamar al servicio para eliminar el archivo
        const result = await deleteFileService(id, archivoId);

        if (!result) {
            return res.status(404).json({
                ok: false,
                msg: 'Archivo no encontrado',
            });
        }

        return res.status(200).json({
            ok: true,
            msg: 'Archivo eliminado correctamente',
        });
    } catch (error) {
        console.error('Error al eliminar el archivo:', error.message);

        return res.status(500).json({
            ok: false,
            error: 'Error interno del servidor',
            details: error.message,
        });
    }
};
