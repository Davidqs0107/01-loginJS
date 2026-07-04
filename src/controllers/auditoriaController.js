import { getAuditoriaService } from "../services/auditoriaService.js";

export const getAuditoria = async (req, res) => {
    const empresa_id = req.empresa_id;
    const { entidad, accion, page = 1, pageSize = 50 } = req.query;
    try {
        const result = await getAuditoriaService({ empresa_id, entidad, accion, page, pageSize });
        return res.status(200).json({
            ok: true,
            auditoria: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getAuditoria:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener la auditoría.' });
    }
};
