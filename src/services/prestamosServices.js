import { frecuenciaPagoEnum } from "../constants/commons.constans.js";
import { notFoundError } from "../constants/notfound.constants.js";
import { executeSelect, executeSelectOne } from "../helpers/queryS.js";
import { executeTransaction } from "../helpers/transactionSql.js";
import moment from "moment";

export const getPrestamosServices = async (data) => {
    const { page, pageSize, empresa_id } = data;
    try {
        const prestamos = await executeSelect(
            'SELECT * FROM prestamos WHERE empresa_id = $1',
            [empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return prestamos;
    } catch (error) {
        throw error;
    }
}

export const getPrestamosByIdService = async (id, empresa_id) => {
    try {
        const prestamo = await executeSelectOne(
            'SELECT * FROM prestamos WHERE id = $1 AND empresa_id = $2',
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

export const getPrestamosServicesByUserId = async (data) => {
    const { page, pageSize, id, empresa_id } = data;
    try {
        const prestamos = await executeSelect(
            'SELECT * FROM prestamos WHERE usuario_id = $1 AND empresa_id = $2',
            [id, empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return prestamos;
    } catch (error) {
        throw error;
    }
}

export const getPrestamosServicesByClientId = async (data) => {
    const { page, pageSize, id, empresa_id } = data;
    try {
        const prestamos = await executeSelect(
            'SELECT * FROM prestamos WHERE cliente_id = $1 AND empresa_id = $2',
            [id, empresa_id],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return prestamos;
    } catch (error) {
        throw error;
    }
}

export const crearPrestamoService = async (data) => {
    const { cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio } = data;
    try {
        const prestamo = await executeTransaction(async (client) => {
            const query = `
                INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`;
            const prestamoResult = await client.query(query, [cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio]);
            const idPrestamo = prestamoResult.rows[0].id;
            // Calcular las cuotas
            const cuotas = calcularCuotas({
                monto,
                tasaInteres: tasa_interes,
                totalCuotas: total_cuotas,
                frecuenciaPago: frecuencia_pago,
                fechaInicio: fecha_inicio,
            });

            // Insertar múltiples cuotas en una sola consulta
            const cuotasValues = cuotas
                .map(
                    (cuota, index) =>
                        `(${idPrestamo}, ${index + 1}, '${cuota.fechaPago}', ${cuota.monto}, 'pendiente')`
                )
                .join(", ");

            const cuotasQuery = `
                    INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto, estado)
                    VALUES ${cuotasValues} RETURNING *`;

            const cuotasResult = await client.query(cuotasQuery);

            return { prestamo: prestamoResult.rows, cuotas: cuotasResult.rows };
        });
        return prestamo;
    } catch (error) {
        throw error;
    }
}



const calcularCuotas = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const cuotas = [];
    const montoTotal = monto * (1 + tasaInteres / 100); // Monto total incluyendo interés
    const montoCuota = parseFloat((montoTotal / totalCuotas).toFixed(2)); // Redondear a 2 decimales

    let frecuenciaUnidad;
    switch (frecuenciaPago) {
        case frecuenciaPagoEnum.diario:
            frecuenciaUnidad = "days";
            break;
        case frecuenciaPagoEnum.semanal:
            frecuenciaUnidad = "weeks";
            break;
        case frecuenciaPagoEnum.quincenal:
            frecuenciaUnidad = "weeks";
            break;
        case frecuenciaPagoEnum.mensual:
            frecuenciaUnidad = "months";
            break;
        case frecuenciaPagoEnum.trimestral:
            frecuenciaUnidad = "months";
            break;
        case frecuenciaPagoEnum.semestral:
            frecuenciaUnidad = "months";
            break;
        case frecuenciaPagoEnum.anual:
            frecuenciaUnidad = "years";
            break;
        default:
            throw new Error("Frecuencia de pago no válida");
    }

    for (let i = 1; i <= totalCuotas; i++) {
        const cantidad = frecuenciaPago === frecuenciaPagoEnum.quincenal ? i * 2 - 1 : i; // Casos como quincenal
        const fechaPago = moment(fechaInicio)
            .add(cantidad, frecuenciaUnidad)
            .format("YYYY-MM-DD");
        cuotas.push({
            numeroCuota: i,
            fechaPago,
            monto: montoCuota,
        });
    }

    return cuotas;
};

