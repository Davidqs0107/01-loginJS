import { notFoundError } from "../constants/notfound.constants.js";
import { getCuotasByClientIdServices, getCuotasByIdService, getCuotasByPrestamoIdService, getCuotasByUserIdServices, getCuotasServices, updateCuotaService } from "../services/cuotaServices.js";

export const getCuotas = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getCuotasServices({ page, pageSize, empresa_id });
        return res.status(200).json({
            ok: true,
            cuotas: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getCuotas:', error);
        res.status(500).json({ msg: 'Error al obtener las cuotas.' });
    }
}

export const getCuotasByPrestamoId = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const { prestamo_id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getCuotasByPrestamoIdService({ page, pageSize, prestamo_id, empresa_id });
        return res.status(200).json({
            ok: true,
            cuotas: result.data,
        });
    } catch (error) {
        console.error('Error en getCuotasByPrestamoId:', error);
        res.status(500).json({ msg: 'Error al obtener las cuotas.' });
    }
}
export const getCuotasByUserId = async (req, res) => {
    const { user_id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const { page = 1, pageSize = 10 } = req.query;
    try {
        const result = await getCuotasByUserIdServices({ page, pageSize, id: user_id, empresa_id });
        return res.status(200).json({
            ok: true,
            cuotas: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getCuotasByUserId:', error);
        res.status(500).json({ msg: 'Error al obtener las cuotas.' });
    }
}
export const getCuotasByClientId = async (req, res) => {
    const { client_id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const { page = 1, pageSize = 10 } = req.query;
    try {
        const result = await getCuotasByClientIdServices({ page, pageSize, id: client_id, empresa_id });
        return res.status(200).json({
            ok: true,
            cuotas: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getCuotasByClientId:', error);
        res.status(500).json({ msg: 'Error al obtener las cuotas.' });
    }
}
export const getCuotasById = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getCuotasByIdService(id, empresa_id);
        return res.status(200).json({
            ok: true,
            cuota: result,
        });
    } catch (error) {
        console.error('Error en getCuotasById:', error);
        if (error.message === notFoundError.cuotaNotFound) {
            return res.status(404).json({ msg: notFoundError.cuotaNotFound });
        }
        res.status(500).json({ msg: 'Error al obtener la cuota.' });
    }
}


export const updateCuota = async (req, res) => {
    const { id } = req.params;
    const data = req.body; // monto_pagado, estado
    data.empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const cuota = await updateCuotaService(id, data);
        return res.status(200).json({
            ok: true,
            cuota,
        });
    } catch (error) {
        console.error('Error en updateCuota:', error);
        res.status(500).json({ msg: 'Error al actualizar la cuota.' });
    }
}