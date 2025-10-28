import { notFoundError } from "../constants/notfound.constants.js";
import { crearMultipagoService, crearPagoService, eliminarPagoService, getPagosbyCuotaIdServices, getPagosByIdServices, getPagosbyUserIdServices } from "../services/pagosServices.js";

export const getPagosbyUserId = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const id = req.params.user_id;
    try {
        const result = await getPagosbyUserIdServices({ page, pageSize, empresa_id, id });
        return res.status(200).json({
            ok: true,
            prestamos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getPagos:', error);
        res.status(500).json({ msg: 'Error al obtener los pagos.' });
    }

}
export const getPagosbyCuotaId = async (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    const id = req.params.cuota_id;
    try {
        const result = await getPagosbyCuotaIdServices({ page, pageSize, empresa_id, id });
        return res.status(200).json({
            ok: true,
            pagos: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('Error en getPagos:', error);
        res.status(500).json({ msg: 'Error al obtener los pagos.' });
    }
}
export const getPagosById = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await getPagosByIdServices({ id, empresa_id });
        return res.status(200).json({
            ok: true,
            prestamo: result,
        });
    } catch (error) {
        console.error('Error en getPagosById:', error);
        res.status(500).json({ msg: 'Error al obtener el pago.' });
    }
}

export const crearPago = async (req, res) => {
    const data = req.body;
    data.empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    data.usuario_id = req.id; // ID del usuario desde el middleware
    try {
        const { pagoId, mensajeExcedente, cuotaActualizada, montoAplicado } = await crearPagoService(data);
        res.status(201).json({
            ok: true,
            pagoId,
            msg: mensajeExcedente,
            cuotaActualizada: cuotaActualizada,
            montoAplicado: montoAplicado,
        });
    } catch ({ message }) {
        console.error('Error en crearPago:', message);
        return res.status(500).json({ ok: false, msg: message });
    }
}
/**
 * Controlador para registrar un multipago a un préstamo.
 * Aplica el monto total pagado a las cuotas pendientes en orden.
 */
export const crearMultipago = async (req, res) => {
    // 1. Recoger datos y agregar IDs desde el middleware
    const data = req.body;
    // data.empresa_id = req.empresa_id; // Si fuera necesario para el contexto, aunque no se usa en el servicio
    data.usuario_id = req.id; // ID del usuario que registra el pago (desde el middleware)

    // Se asume que el body contiene: { prestamo_id, montoTotal, fecha_pago, tipo_pago }

    try {
        // 2. Llamar al nuevo servicio de multipago
        const { pagosRealizados, montoExcedente, montoTotal, mensaje } = await crearMultipagoService(data);

        // 3. Responder al cliente
        res.status(201).json({
            ok: true,
            msg: mensaje, // El mensaje incluye la información del excedente
            montoTotalPagado: montoTotal,
            montoExcedente: montoExcedente,
            totalCuotasAfectadas: pagosRealizados.length,
            // Opcionalmente, devolver la lista detallada de los pagos realizados
            pagos: pagosRealizados.map(p => ({
                pagoId: p.pagoId,
                cuotaId: p.cuota.id,
                numeroCuota: p.cuota.numero_cuota,
                montoAplicado: p.montoAplicado,
                estadoFinal: p.cuota.estado
            })),
        });

    } catch (error) {
        console.error('Error en crearMultipago:', error.message);
        // Devolver un error 500 o 400 si el error es de validación/negocio
        const statusCode = error.message.includes('No tiene cuotas') || error.message.includes('positivos') ? 400 : 500;
        return res.status(statusCode).json({
            ok: false,
            msg: error.message
        });
    }
};
// export const actualizarPago = async (req, res) => {
//     const { id } = req.params;
//     const data = req.body;
//     data.empresa_id = req.empresa_id; // ID de la empresa desde el middleware
//     try {
//         const result = await actualizarPagoService(id, data);
//         return res.status(200).json({
//             ok: true,
//             message: result,
//         });
//     } catch (error) {
//         console.error('Error en actualizarPago:', error);
//         return res.status(500).json({ msg: 'Error al actualizar el pago.' });
//     }
// }

export const eliminarPago = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresa_id; // ID de la empresa desde el middleware
    try {
        const result = await eliminarPagoService(id, empresa_id);
        return res.status(200).json({
            ok: true,
            message: result,
        });
    } catch (error) {
        console.error('Error en eliminarPago:', error);
        if (error.message === notFoundError.pagoNotFound) {
            return res.status(400).json({ msg: notFoundError.pagoNotFound });
        }
        return res.status(500).json({ msg: 'Error al eliminar el pago.', error });
    }
}