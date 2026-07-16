import { response } from 'express';
import {
    getCrecimientoEmpresasService,
    getDistribucionPlanesService,
    getEmpresasRecientesService,
    getGlobalMetricsService,
    getSuscripcionesCriticasService,
} from '../services/adminMetricsService.js';

export const getGlobalMetrics = async (req, res = response) => {
    try {
        const data = await getGlobalMetricsService();
        res.status(200).json({ ok: true, metrics: data });
    } catch (error) {
        console.error('Error en getGlobalMetrics:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener métricas globales' });
    }
};

export const getCrecimientoEmpresas = async (req, res = response) => {
    try {
        const data = await getCrecimientoEmpresasService();
        res.status(200).json({ ok: true, data });
    } catch (error) {
        console.error('Error en getCrecimientoEmpresas:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener crecimiento' });
    }
};

export const getDistribucionPlanes = async (req, res = response) => {
    try {
        const data = await getDistribucionPlanesService();
        res.status(200).json({ ok: true, data });
    } catch (error) {
        console.error('Error en getDistribucionPlanes:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener distribución' });
    }
};

export const getEmpresasRecientes = async (req, res = response) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 10;
        const data = await getEmpresasRecientesService(limit);
        res.status(200).json({ ok: true, data });
    } catch (error) {
        console.error('Error en getEmpresasRecientes:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener empresas recientes' });
    }
};

export const getSuscripcionesCriticas = async (req, res = response) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 10;
        const data = await getSuscripcionesCriticasService(limit);
        res.status(200).json({ ok: true, data });
    } catch (error) {
        console.error('Error en getSuscripcionesCriticas:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener suscripciones críticas' });
    }
};
