import { notFoundError } from "../constants/notfound.constants.js";
import { executeSelect, executeSelectOne } from "../helpers/queryS.js";
import { executeTransaction } from "../helpers/transactionSql.js";

export const getPagosbyUserIdServices = async (data) => {
    const { page, pageSize, id } = data;
    try {
        const prestamos = await executeSelect(
            'SELECT * FROM pagos WHERE usuario_id = $1',
            [id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return prestamos;
    } catch (error) {
        throw error;
    }
}
export const getPagosbyCuotaIdServices = async (data) => {
    const { page, pageSize, id } = data;
    try {
        const prestamos = await executeSelect(
            'SELECT * FROM pagos WHERE cuota_id = $1',
            [id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return prestamos;
    } catch (error) {
        throw error;
    }
}

export const getPagosByIdServices = async (data) => {
    const { id, empresa_id } = data;
    try {
        const prestamo = await executeSelectOne(
            'SELECT * FROM pagos WHERE id = $1 and empresa_id = $2',
            [id, empresa_id]
        );
        if (prestamo.length === 0) {
            throw new Error(notFoundError.prestamoNotFound);
        }

        return prestamo[0];
    } catch (error) {
        throw error;
    }
}

export const crearPagoService = async (data) => {
    const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago } = data;

    try {
        const res = await executeTransaction(async (client) => {
            // Verificar el estado actual de la cuota
            const verificarCuotaQuery = `
                SELECT monto, monto_pagado, estado
                FROM cuotas
                WHERE id = $1`;
            const cuota = await client.query(verificarCuotaQuery, [cuota_id]);

            if (cuota.rowCount === 0) {
                throw new Error("No se encontro la cuota especificada.");
            }

            const { monto: montoCuota, monto_pagado: montoPagadoActual } = cuota.rows[0];
            const restante = montoCuota - montoPagadoActual;

            if (restante <= 0) {
                throw new Error("La cuota ya esta completamente pagada.");
            }

            // Determinar cuánto del pago se aplicará a la cuota
            const montoAplicado = Math.min(monto, restante);
            const nuevoMontoPagado = parseFloat(montoPagadoActual) + montoAplicado;
            const nuevoEstado = nuevoMontoPagado >= montoCuota ? "pagada" : "parcial";

            // Insertar el pago en la tabla pagos
            const insertarPagoQuery = `
                INSERT INTO pagos (cuota_id, usuario_id, monto,tipo_pago, fecha_pago)
                VALUES ($1, $2, $3, $4,$5)
                RETURNING id`;
            const pagoResult = await client.query(insertarPagoQuery, [cuota_id, usuario_id, montoAplicado, tipo_pago, fecha_pago]);

            // Actualizar la cuota con el monto pagado y el nuevo estado
            const actualizarCuotaQuery = `
                UPDATE cuotas
                SET monto_pagado = $1, estado = $2,updated_at = NOW()
                WHERE id = $3
                RETURNING monto, monto_pagado, estado`;
            const cuotaResult = await client.query(actualizarCuotaQuery, [nuevoMontoPagado, nuevoEstado, cuota_id]);

            // Validar si la cuota fue actualizada correctamente
            if (cuotaResult.rowCount === 0) {
                throw new Error("Error al actualizar la cuota.");
            }

            return {
                pagoId: pagoResult.rows[0].id,
                cuotaActualizada: cuotaResult.rows[0],
                mensajeExcedente: monto > restante ? `El monto del pago excedió el requerido. Se aplicaron ${montoAplicado} y el excedente es ${monto - restante}.` : null,
                montoAplicado: montoAplicado,
            };
        });

        return {
            pagoId: res.pagoId,
            cuotaActualizada: res.cuotaActualizada,
            mensajeExcedente: res.mensajeExcedente,
            montoAplicado: res.montoAplicado
        };
    } catch (error) {
        throw error;
    }

};
/**
 * Realiza un pago que puede cubrir múltiples cuotas de un préstamo.
 *
 * @param {object} data - Datos del multipago.
 * @param {number} data.prestamo_id - ID del préstamo al que se aplica el pago.
 * @param {number} data.usuario_id - ID del usuario que registra el pago.
 * @param {number} data.montoTotal - Monto total entregado por el cliente.
 * @param {string} data.fecha_pago - Fecha del pago.
 * @param {string} data.tipo_pago - Tipo de pago (efectivo, transferencia, etc.).
 * @returns {object} Objeto con el resumen de las cuotas pagadas y el excedente.
 */
export const crearMultipagoService = async (data) => {
    const { prestamo_id, usuario_id, montoTotal, fecha_pago, tipo_pago } = data;
    let montoPendiente = parseFloat(montoTotal);
    const pagosRealizados = [];

    if (montoPendiente <= 0) {
        throw new Error("El monto total del pago debe ser positivo.");
    }

    try {
        const res = await executeTransaction(async (client) => {
            // 1. Obtener todas las cuotas pendientes o parciales del préstamo, ordenadas por número de cuota/fecha.
            const obtenerCuotasQuery = `
                SELECT id, monto, monto_pagado, estado, numero_cuota
                FROM cuotas
                WHERE prestamo_id = $1 AND estado IN ('pendiente', 'parcial')
                ORDER BY numero_cuota ASC`;

            const cuotasResult = await client.query(obtenerCuotasQuery, [prestamo_id]);

            if (cuotasResult.rowCount === 0) {
                return {
                    cuotasPagadas: [],
                    montoExcedente: montoTotal,
                    mensaje: "El préstamo no tiene cuotas pendientes o parciales. El monto total es excedente.",
                };
            }

            const cuotas = cuotasResult.rows;

            // 2. Iterar sobre las cuotas y aplicar el pago hasta agotar el monto total.
            for (const cuota of cuotas) {
                if (montoPendiente <= 0) {
                    break; // Se agotó el monto de pago
                }

                const restanteCuota = parseFloat(cuota.monto) - parseFloat(cuota.monto_pagado);

                if (restanteCuota <= 0) {
                    continue; // Cuota ya pagada (aunque la consulta inicial intenta evitar esto, es una doble verificación)
                }

                // Determinar cuánto del pago se aplicará a esta cuota
                const montoAplicado = Math.min(montoPendiente, restanteCuota);
                const nuevoMontoPagado = parseFloat(cuota.monto_pagado) + montoAplicado;
                const nuevoEstado = nuevoMontoPagado >= parseFloat(cuota.monto) ? "pagada" : "parcial";

                // 3. Insertar el pago en la tabla 'pagos'
                const insertarPagoQuery = `
                    INSERT INTO pagos (cuota_id, usuario_id, monto, tipo_pago, fecha_pago)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id`;
                const pagoResult = await client.query(insertarPagoQuery, [cuota.id, usuario_id, montoAplicado, tipo_pago, fecha_pago]);

                // 4. Actualizar la cuota
                const actualizarCuotaQuery = `
                    UPDATE cuotas
                    SET monto_pagado = $1, estado = $2, updated_at = NOW()
                    WHERE id = $3
                    RETURNING id, numero_cuota, monto, monto_pagado, estado`;
                const cuotaResult = await client.query(actualizarCuotaQuery, [nuevoMontoPagado, nuevoEstado, cuota.id]);

                // 5. Registrar el pago realizado y actualizar el monto pendiente
                pagosRealizados.push({
                    pagoId: pagoResult.rows[0].id,
                    cuota: cuotaResult.rows[0],
                    montoAplicado: montoAplicado,
                    estadoAnterior: cuota.estado,
                });

                montoPendiente -= montoAplicado;
            }

            return {
                pagosRealizados: pagosRealizados,
                montoExcedente: montoPendiente > 0 ? montoPendiente : 0,
                montoTotal: montoTotal,
            };
        });

        return {
            pagosRealizados: res.pagosRealizados,
            montoExcedente: res.montoExcedente,
            montoTotal: res.montoTotal,
            mensaje: res.montoExcedente > 0
                ? `Multipago completado. Se aplicaron pagos a ${res.pagosRealizados.length} cuotas. Monto excedente: ${res.montoExcedente}.`
                : `Multipago completado. Se aplicaron pagos a ${res.pagosRealizados.length} cuotas.`,
        };
    } catch (error) {
        // La transacción se revierte automáticamente si executeTransaction maneja el rollback.
        throw error;
    }
};
export const eliminarPagoService = async (pagoId) => {
    try {
        await executeTransaction(async (client) => {
            // Obtener información del pago antes de eliminarlo
            const obtenerPagoQuery = `
                SELECT cuota_id, monto
                FROM pagos
                WHERE id = $1`;
            const pagoResult = await client.query(obtenerPagoQuery, [pagoId]);

            if (pagoResult.rowCount === 0) {
                throw new Error(notFoundError.pagoNotFound);
            }

            const { cuota_id, monto } = pagoResult.rows[0];

            // Eliminar el pago de la tabla `pagos`
            const eliminarPagoQuery = `
                DELETE FROM pagos
                WHERE id = $1`;
            await client.query(eliminarPagoQuery, [pagoId]);

            // Actualizar la cuota asociada
            const actualizarCuotaQuery = `
                UPDATE cuotas
                SET monto_pagado = monto_pagado - $1,
                    estado = CASE
                        WHEN (monto_pagado - $1) < monto THEN 'parcial'
                        ELSE estado
                    END
                WHERE id = $2
                RETURNING monto, monto_pagado, estado`;
            const cuotaResult = await client.query(actualizarCuotaQuery, [monto, cuota_id]);

            if (cuotaResult.rowCount === 0) {
                throw new Error("Error al actualizar la cuota asociada.");
            }

            return {
                success: true,
                message: "Pago eliminado exitosamente y cuota actualizada.",
                cuotaActualizada: cuotaResult.rows[0],
            };
        });

        return {
            success: true,
            message: "Pago eliminado exitosamente.",
        };
    } catch (error) {
        throw error;
    }
};
