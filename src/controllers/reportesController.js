import { response } from 'express';
import {
    getReporteMoraService,
    getReporteCarteraService,
    getReporteCobrosService,
    getReporteAgendaService,
    getReporteRecaudacionService,
    getReporteFichaClienteService,
} from '../services/reportesService.js';

// Fecha de hoy en formato YYYY-MM-DD
const hoy = () => new Date().toISOString().split('T')[0];

// Primer día del mes actual en formato YYYY-MM-DD
const primerDiaMes = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
};

// ─────────────────────────────────────────
// ALTA PRIORIDAD
// ─────────────────────────────────────────

/**
 * GET /api/reportes/mora
 * Query params: page, pageSize, dias_mora_min, cobrador_id
 */
export const getReporteMora = async (req, res = response) => {
    const { empresa_id } = req;
    const { page = 1, pageSize = 50, dias_mora_min, cobrador_id } = req.query;

    try {
        const result = await getReporteMoraService({
            empresa_id,
            dias_mora_min,
            cobrador_id,
            page,
            pageSize,
        });
        return res.status(200).json({ ok: true, ...result });
    } catch (error) {
        console.error('Error en getReporteMora:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar reporte de mora' });
    }
};

/**
 * GET /api/reportes/cartera
 * Sin parámetros adicionales.
 */
export const getReporteCartera = async (req, res = response) => {
    const { empresa_id } = req;

    try {
        const data = await getReporteCarteraService({ empresa_id });
        return res.status(200).json({ ok: true, data });
    } catch (error) {
        console.error('Error en getReporteCartera:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar reporte de cartera' });
    }
};

/**
 * GET /api/reportes/cobros
 * Query params: fecha_inicio (default: 1er día mes actual), fecha_fin (default: hoy)
 */
export const getReporteCobros = async (req, res = response) => {
    const { empresa_id } = req;
    const { fecha_inicio = primerDiaMes(), fecha_fin = hoy() } = req.query;

    try {
        const data = await getReporteCobrosService({ empresa_id, fecha_inicio, fecha_fin });
        return res.status(200).json({ ok: true, data, fecha_inicio, fecha_fin });
    } catch (error) {
        console.error('Error en getReporteCobros:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar reporte de cobros' });
    }
};

// ─────────────────────────────────────────
// MEDIA PRIORIDAD
// ─────────────────────────────────────────

/**
 * GET /api/reportes/agenda
 * Query params: dias (default: 7), cobrador_id, page, pageSize
 * Si el rol es 'cobrador', solo ve sus propias cuotas.
 */
export const getReporteAgenda = async (req, res = response) => {
    const { empresa_id, rol, id } = req;
    const { dias = 7, cobrador_id, page = 1, pageSize = 50 } = req.query;

    // Cobrador solo puede ver su propia agenda
    const filteredCobrador = rol === 'cobrador' ? id : cobrador_id;

    try {
        const result = await getReporteAgendaService({
            empresa_id,
            dias,
            cobrador_id: filteredCobrador,
            page,
            pageSize,
        });
        return res.status(200).json({ ok: true, ...result });
    } catch (error) {
        console.error('Error en getReporteAgenda:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar agenda de cobro' });
    }
};

/**
 * GET /api/reportes/recaudacion
 * Query params: fecha_inicio (default: 1er día mes actual), fecha_fin (default: hoy)
 */
export const getReporteRecaudacion = async (req, res = response) => {
    const { empresa_id } = req;
    const { fecha_inicio = primerDiaMes(), fecha_fin = hoy() } = req.query;

    try {
        const data = await getReporteRecaudacionService({ empresa_id, fecha_inicio, fecha_fin });
        return res.status(200).json({ ok: true, data, fecha_inicio, fecha_fin });
    } catch (error) {
        console.error('Error en getReporteRecaudacion:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar reporte de recaudación' });
    }
};

/**
 * GET /api/reportes/cliente/:clienteId
 * Historial completo del cliente: datos + todos sus préstamos con estado de cuotas.
 */
export const getReporteFichaCliente = async (req, res = response) => {
    const { empresa_id } = req;
    const { clienteId } = req.params;

    try {
        const data = await getReporteFichaClienteService({
            empresa_id,
            cliente_id: clienteId,
        });

        if (!data.cliente) {
            return res.status(404).json({ ok: false, msg: 'Cliente no encontrado' });
        }

        return res.status(200).json({ ok: true, ...data });
    } catch (error) {
        console.error('Error en getReporteFichaCliente:', error);
        return res.status(500).json({ ok: false, msg: 'Error al generar ficha del cliente' });
    }
};
