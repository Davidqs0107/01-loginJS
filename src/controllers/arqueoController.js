import { cerrarArqueoService, getArqueosService, getResumenDiaService, resolverArqueoService } from "../services/arqueoService.js";
import { registrarAuditoria } from "../services/auditoriaService.js";

/**
 * Resumen del día del cobrador (previsualización). Un cobrador ve el suyo;
 * un admin puede consultar el de cualquier cobrador vía ?usuario_id.
 */
export const getResumenDia = async (req, res) => {
    const empresa_id = req.empresa_id;
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const usuario_id = req.query.usuario_id || req.id;
    try {
        const resumen = await getResumenDiaService({ empresa_id, usuario_id, fecha });
        return res.status(200).json({ ok: true, resumen });
    } catch (error) {
        console.error('Error en getResumenDia:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener el resumen del día.' });
    }
};

/** Cierra la caja del cobrador logueado para una fecha. */
export const cerrarArqueo = async (req, res) => {
    const empresa_id = req.empresa_id;
    const usuario_id = req.id; // el cobrador cierra su propia caja
    const { fecha, total_entregado, nota } = req.body;
    if (!fecha || total_entregado === undefined) {
        return res.status(400).json({ ok: false, msg: 'fecha y total_entregado son obligatorios.' });
    }
    try {
        const arqueo = await cerrarArqueoService({ empresa_id, usuario_id, fecha, total_entregado, nota });
        return res.status(201).json({ ok: true, arqueo });
    } catch (error) {
        console.error('Error en cerrarArqueo:', error.message);
        return res.status(400).json({ ok: false, msg: error.message });
    }
};

/** Aprueba o rechaza un arqueo (admin). Registra la acción en auditoría. */
export const resolverArqueo = async (req, res) => {
    const empresa_id = req.empresa_id;
    const { id } = req.params;
    const { estado } = req.body; // 'aprobado' | 'rechazado'
    try {
        const arqueo = await resolverArqueoService({ id, empresa_id, estado, aprobado_por: req.id });
        await registrarAuditoria({
            empresa_id,
            usuario_id: req.id,
            accion: `arqueo_${estado}`,
            entidad: 'arqueo',
            entidad_id: Number(id),
            datos_despues: arqueo,
            ip: req.ip,
        });
        return res.status(200).json({ ok: true, arqueo });
    } catch (error) {
        console.error('Error en resolverArqueo:', error.message);
        return res.status(400).json({ ok: false, msg: error.message });
    }
};

/** Lista arqueos de la empresa (admin: todos; cobrador: solo los suyos). */
export const getArqueos = async (req, res) => {
    const empresa_id = req.empresa_id;
    const { fecha_inicio, fecha_fin, page = 1, pageSize = 30 } = req.query;
    // Un cobrador solo ve sus propios arqueos; un admin puede filtrar por ?usuario_id
    const esCobrador = req.rol === 'cobrador';
    const usuario_id = esCobrador ? req.id : req.query.usuario_id;
    try {
        const result = await getArqueosService({ empresa_id, usuario_id, fecha_inicio, fecha_fin, page, pageSize });
        return res.status(200).json({ ok: true, arqueos: result.data, meta: result.meta });
    } catch (error) {
        console.error('Error en getArqueos:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener los arqueos.' });
    }
};
