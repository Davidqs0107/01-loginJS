import { getComprobantesService, validarComprobanteService } from "../services/comprobanteService.js";

/** Lista comprobantes de la empresa (staff), filtro opcional ?estado=. */
export const getComprobantes = async (req, res) => {
    const empresa_id = req.empresa_id;
    const { estado, page = 1, pageSize = 30 } = req.query;
    try {
        const result = await getComprobantesService({ empresa_id, estado, page, pageSize });
        return res.status(200).json({ ok: true, comprobantes: result.data, meta: result.meta });
    } catch (error) {
        console.error('Error en getComprobantes:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener los comprobantes.' });
    }
};

/** Aprueba o rechaza un comprobante (staff). Al aprobar con cuota genera el pago. */
export const validarComprobante = async (req, res) => {
    const empresa_id = req.empresa_id;
    const { id } = req.params;
    const { estado } = req.body; // 'aprobado' | 'rechazado'
    try {
        const comprobante = await validarComprobanteService({
            id, empresa_id, estado, usuario_id: req.id, ip: req.ip,
        });
        return res.status(200).json({ ok: true, comprobante });
    } catch ({ message }) {
        console.error('Error en validarComprobante:', message);
        return res.status(400).json({ ok: false, msg: message });
    }
};
