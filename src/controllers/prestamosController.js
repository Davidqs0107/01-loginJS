import { response } from "express";
import { notFoundError } from "../constants/notfound.constants.js";
import { crearPrestamoService, completarPrestamoService, deleteFileService, getPrestamosByClientIdServices, getPrestamosByIdService, getPrestamosByUserIdServices, getPrestamosServices, getUploadFileService, refinanciarPrestamoService, updatePrestamoService, uploadFileService } from "../services/prestamosServices.js";
import { estadoPrestamo } from "../constants/commons.constans.js";
import { formatDateWithDateFns } from "../helpers/functions.js";

export const refinanciarPrestamo = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id;
    const usuario_id = req.id;
    const { monto_adicional, total_cuotas, fecha_inicio, tasa_interes, frecuencia_pago, tipo_prestamo } = req.body;
    try {
        const result = await refinanciarPrestamoService({
            prestamo_id: id, empresa_id, usuario_id,
            monto_adicional, total_cuotas, fecha_inicio, tasa_interes, frecuencia_pago, tipo_prestamo,
            actor: { ip: req.ip },
        });
        return res.status(201).json({ ok: true, msg: 'Préstamo refinanciado', ...result });
    } catch ({ message }) {
        console.error('Error en refinanciarPrestamo:', message);
        const status = message === notFoundError.prestamoNotFound ? 404 : 400;
        return res.status(status).json({ ok: false, msg: message });
    }
}

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
    const { id } = req.params;

    if (!req.files || !req.files.archivo) {
        return res.status(400).json({ ok: false, msg: 'No se envió ningún archivo' });
    }

    try {
        const result = await uploadFileService(id, req.files.archivo);
        return res.status(201).json({
            ok: true,
            msg: 'Archivo subido',
            archivo: result,
        });
    } catch (error) {
        // express-fileupload detectó truncado antes de llegar al service
        if (error && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                ok: false,
                msg: 'La imagen o documento es demasiado grande. Máximo 1 MB.',
            });
        }
        console.error('Error en uploadFile:', error);
        return res.status(400).json({
            ok: false,
            msg: error.message || 'Error al subir el archivo',
        });
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

export const completarPrestamo = async (req, res = response) => {
    const { id } = req.params;
    try {
        const result = await completarPrestamoService(id);
        return res.status(200).json({
            ok: true,
            prestamo: result
        });
    } catch (error) {
        console.error('Error en completarPrestamo:', error);
        return res.status(500).json({
            ok: false,
            msg: error.message || 'Error al completar el préstamo'
        });
    }
};
