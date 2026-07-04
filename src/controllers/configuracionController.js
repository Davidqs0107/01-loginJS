import { getConfiguracionService, upsertConfiguracionService } from "../services/configuracionService.js";
import { registrarAuditoria } from "../services/auditoriaService.js";

export const getConfiguracion = async (req, res) => {
    const empresa_id = req.empresa_id;
    try {
        const configuracion = await getConfiguracionService(empresa_id);
        return res.status(200).json({ ok: true, configuracion });
    } catch (error) {
        console.error('Error en getConfiguracion:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener la configuración.' });
    }
};

export const updateConfiguracion = async (req, res) => {
    const empresa_id = req.empresa_id;
    try {
        const antes = await getConfiguracionService(empresa_id);
        const configuracion = await upsertConfiguracionService(empresa_id, req.body);

        // Auditar el cambio de configuración (afecta mora e incumplimiento)
        await registrarAuditoria({
            empresa_id,
            usuario_id: req.id,
            accion: 'actualizar_configuracion',
            entidad: 'configuracion_empresa',
            entidad_id: configuracion.id,
            datos_antes: antes,
            datos_despues: configuracion,
            ip: req.ip,
        });

        return res.status(200).json({ ok: true, configuracion });
    } catch (error) {
        console.error('Error en updateConfiguracion:', error);
        res.status(500).json({ ok: false, msg: 'Error al actualizar la configuración.' });
    }
};
