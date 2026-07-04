import { executeSelect, executeQuery } from "../helpers/queryS.js";
import { crearPagoService } from "./pagosServices.js";
import { registrarAuditoria } from "./auditoriaService.js";

/** Lista los comprobantes de la empresa, con filtro opcional por estado. */
export const getComprobantesService = async ({ empresa_id, estado, page = 1, pageSize = 30 }) => {
    const params = [empresa_id];
    let filtro = '';
    if (estado) {
        params.push(estado);
        filtro = ` AND cp.estado = $${params.length}`;
    }
    const query = `
        SELECT cp.*, c.nombre || ' ' || c.apellido AS cliente
        FROM comprobantes_pago cp
        JOIN clientes c ON cp.cliente_id = c.id
        WHERE cp.empresa_id = $1 ${filtro}
        ORDER BY cp.created_at DESC`;
    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};

/**
 * Valida un comprobante (acción de staff):
 *  - 'aprobado': si tiene cuota, genera un pago real (vía waterfall) por su monto.
 *  - 'rechazado': solo marca el estado.
 * Registra la acción en auditoría.
 *
 * @param {object} params
 * @param {number} params.id - Comprobante.
 * @param {number} params.empresa_id
 * @param {string} params.estado - 'aprobado' | 'rechazado'
 * @param {number} params.usuario_id - Staff que valida.
 * @param {string} [params.ip]
 */
export const validarComprobanteService = async ({ id, empresa_id, estado, usuario_id, ip }) => {
    if (!['aprobado', 'rechazado'].includes(estado)) {
        throw new Error("Estado inválido. Use 'aprobado' o 'rechazado'.");
    }

    const rows = await executeQuery(
        `SELECT * FROM comprobantes_pago WHERE id = $1 AND empresa_id = $2`,
        [id, empresa_id]
    );
    if (rows.length === 0) throw new Error('Comprobante no encontrado.');
    const comprobante = rows[0];
    if (comprobante.estado !== 'pendiente') {
        throw new Error(`El comprobante ya fue ${comprobante.estado}.`);
    }

    let pagoId = null;

    if (estado === 'aprobado' && comprobante.cuota_id) {
        // Generar el pago real a través del flujo normal (respeta mora/estado)
        const fechaHoy = new Date().toISOString().slice(0, 10);
        const pago = await crearPagoService({
            cuota_id: comprobante.cuota_id,
            usuario_id,
            empresa_id,
            monto: comprobante.monto,
            fecha_pago: fechaHoy,
            tipo_pago: 'qr',
        });
        pagoId = pago.pagoId;
    }

    const actualizado = await executeQuery(
        `UPDATE comprobantes_pago
         SET estado = $1, pago_id = $2, revisado_por = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [estado, pagoId, usuario_id, id]
    );

    await registrarAuditoria({
        empresa_id,
        usuario_id,
        accion: `comprobante_${estado}`,
        entidad: 'comprobante_pago',
        entidad_id: Number(id),
        datos_antes: comprobante,
        datos_despues: actualizado[0],
        ip,
    });

    return actualizado[0];
};
