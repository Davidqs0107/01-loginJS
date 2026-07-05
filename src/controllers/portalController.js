import { crearComprobanteService, getPortalResumenService } from "../services/portalService.js";
import { sanitizeFileName } from "../helpers/sanityFileName.js";

/** Resumen público del portal (deuda del cliente) por token. */
export const getPortalResumen = async (req, res) => {
    const { token } = req.params;
    try {
        const resumen = await getPortalResumenService(token);
        return res.status(200).json({ ok: true, ...resumen });
    } catch ({ message }) {
        return res.status(404).json({ ok: false, msg: message });
    }
};

/** El cliente sube un comprobante de pago (opcionalmente con archivo adjunto). */
export const subirComprobante = async (req, res) => {
    const { token } = req.params;
    const { cuota_id, prestamo_id, monto, referencia, request_id } = req.body;

    let archivo = null;
    try {
        // Guardar archivo adjunto si viene (imagen/pdf del comprobante)
        if (req.files && req.files.comprobante) {
            const file = req.files.comprobante;
            const permitidos = ['application/pdf', 'image/jpeg', 'image/png'];
            if (!permitidos.includes(file.mimetype)) {
                return res.status(400).json({ ok: false, msg: 'Tipo de archivo no permitido. Solo PDF, JPG o PNG.' });
            }
            // express-fileupload con limits.fileSize marca truncated=true si el archivo
            // supera el límite; por defecto no aborta, solo trunca silenciosamente.
            if (file.truncated) {
                return res.status(413).json({
                    ok: false,
                    msg: 'La imagen o documento es demasiado grande. Máximo 1 MB.',
                });
            }
            const nombre = `${Date.now()}_${sanitizeFileName(file.name)}`;
            const ruta = `uploads/comprobantes/${nombre}`;
            try {
                await file.mv(ruta);
                archivo = ruta;
            } catch (mvErr) {
                console.error('Error moviendo archivo:', mvErr);
                return res.status(500).json({ ok: false, msg: 'No se pudo guardar el archivo en el servidor.' });
            }
        }

        const comprobante = await crearComprobanteService(token, { cuota_id, prestamo_id, monto, referencia, archivo, request_id });
        return res.status(201).json({
            ok: true,
            msg: 'Comprobante recibido. Será validado por la empresa.',
            comprobante,
        });
    } catch ({ message }) {
        return res.status(400).json({ ok: false, msg: message });
    }
};
