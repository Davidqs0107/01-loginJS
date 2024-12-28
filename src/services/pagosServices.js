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
    const { cuota_id, usuario_id, monto, fecha_pago, empresa_id } = data;

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
                INSERT INTO pagos (cuota_id, usuario_id, monto, fecha_pago)
                VALUES ($1, $2, $3, $4)
                RETURNING id`;
            const pagoResult = await client.query(insertarPagoQuery, [cuota_id, usuario_id, montoAplicado, fecha_pago]);

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
            };
        });

        return {
            pagoId: res.pagoId,
            cuotaActualizada: res.cuotaActualizada,
            mensajeExcedente: res.mensajeExcedente
        };
    } catch (error) {
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
