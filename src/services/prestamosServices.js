import { frecuenciaPagoEnum, tipoPrestamoInteresEnum } from "../constants/commons.constans.js";
import { notFoundError } from "../constants/notfound.constants.js";
import { buildDynamicQuery, buildQueryUpdate } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeQuery, executeSelect, executeSelectOne } from "../helpers/queryS.js";
import { sanitizeFileName } from "../helpers/sanityFileName.js";
import { executeTransaction } from "../helpers/transactionSql.js";
import fs from 'fs/promises';
import moment from "moment";

export const getPrestamosServices = async (data) => {
    const { page, pageSize, empresa_id, fecha_inicio, fecha_fin, searchTerm } = data;

    try {
        let query = `
            SELECT p.*, 
                   c.nombre, c.apellido, c.telefono, c.direccion, c.email,
                   COALESCE(SUM(cu.monto), 0) as monto_total_cuotas,
                   COALESCE(SUM(cu.monto_pagado), 0) as monto_pagado,
                   COALESCE(SUM(cu.monto), 0) - COALESCE(SUM(cu.monto_pagado), 0) as saldo
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
            WHERE p.empresa_id = $1 AND p.estado = true
            and c.estado = true
        `;

        const queryParams = [empresa_id];

        if (searchTerm) {
            // Si hay searchTerm, ignoramos las fechas
            query += ` AND (c.nombre ILIKE $2 OR c.apellido ILIKE $2 OR c.ci = $3)`;
            queryParams.push(`%${searchTerm}%`, searchTerm);
        } else {
            // Si NO hay searchTerm, aplicamos el filtro de fechas
            query += ` AND p.fecha_inicio BETWEEN $2 AND $3`;
            queryParams.push(fecha_inicio, fecha_fin);
        }

        query += ` GROUP BY p.id, c.id`;

        // **Ejecutar la consulta con paginación**
        const prestamos = await executeSelect(query, queryParams, parseInt(page, 10), parseInt(pageSize, 10));

        return prestamos;
    } catch (error) {
        console.error("Error en getPrestamosServices:", error);
        throw new Error("Error al obtener los préstamos.");
    }
};


export const getPrestamosByIdService = async (id, empresa_id, mostrarCuotas) => {
    try {
        const prestamo = await executeSelectOne(
            `SELECT p.*, c.nombre ,c.apellido ,c.telefono ,c.direccion ,c.direccion ,c.email, c.ci
                ,c.latitud,c.longitud
                FROM prestamos p join clientes c 
                on p.cliente_id = c.id 
                WHERE p.id = $1 
                AND p.empresa_id = $2`,
            [id, empresa_id]
        );
        if (prestamo.length === 0) {
            throw new Error(notFoundError.prestamoNotFound);
        }
        if (mostrarCuotas) {
            const { data } = await executeSelect(
                `SELECT * FROM cuotas 
                WHERE prestamo_id = $1
                order by numero_cuota asc`,
                [id], 1, 10000
            );
            prestamo[0].cuotas = data;
        }

        return prestamo[0];
    } catch (error) {
        throw error;
    }
}

export const getPrestamosByUserIdServices = async (data) => {
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

export const getPrestamosByClientIdServices = async (data) => {
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
    const { cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo, documento } = data;
    try {
        const prestamo = await executeTransaction(async (client) => {
            const query = `
                INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo,documento)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,$10)
                RETURNING *`;
            const prestamoResult = await client.query(query, [cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo, documento]);
            const idPrestamo = prestamoResult.rows[0].id;
            // Calcular las cuotas
            const calcularCuotasFn =
                tipo_prestamo === tipoPrestamoInteresEnum.fijo ? calcularCuotasInteresFijo : calcularCuotas;
            const cuotas = calcularCuotasFn({
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

export const updatePrestamoService = async (id, data) => {
    const { campos, valores, placeholders } = buildDynamicQuery(data);
    if (campos.length === 0) {
        throw new Error('No se enviaron campos para actualizar');
    }
    const query = buildQueryUpdate(campos, placeholders, 'prestamos');
    valores.push(id);
    try {
        const prestamo = await executeInsert(query, valores);
        return prestamo;
    } catch (error) {
        throw error;
    }

}

export const uploadFileService = async (id, archivo) => {
    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!tiposPermitidos.includes(archivo.mimetype)) {
        throw new Error('Tipo de archivo no permitido');
    }
    try {
        const sanitizedFileName = sanitizeFileName(archivo.name);
        const nombreArchivo = `${Date.now()}_${sanitizedFileName}`;
        const rutaArchivo = `uploads/${id}/${nombreArchivo}`;


        await archivo.mv(rutaArchivo, async (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Error al guardar el archivo' });
            }

            // Guardar información en la base de datos

        });
        const query = `
        INSERT INTO prestamo_archivos (prestamo_id, nombre_archivo, ruta_archivo)
        VALUES ($1, $2, $3) RETURNING *;
    `;
        const values = [id, nombreArchivo, rutaArchivo];

        return await executeInsert(query, values);
    } catch (error) {
        throw error;
    }
}

export const getUploadFileService = async (id) => {
    try {
        const query = `
        SELECT * FROM prestamo_archivos WHERE prestamo_id = $1;
    `;
        return await executeSelectOne(query, [id]);
    } catch (error) {
        throw error;
    }
}

export const deleteFileService = async (prestamoId, archivoId) => {
    try {
        const querySelect = `
            SELECT ruta_archivo
            FROM prestamo_archivos
            WHERE id = $1 AND prestamo_id = $2;
        `;
        const valuesSelect = [archivoId, prestamoId];
        const archivo = await executeQuery(querySelect, valuesSelect);

        if (archivo.length === 0) {
            return null; // Archivo no encontrado
        }

        const rutaArchivo = archivo[0].ruta_archivo;

        // Eliminar el archivo del sistema de archivos
        await fs.unlink(rutaArchivo);

        // Eliminar el registro de la base de datos
        const queryDelete = `
            DELETE FROM prestamo_archivos
            WHERE id = $1 AND prestamo_id = $2;
        `;
        const valuesDelete = [archivoId, prestamoId];
        await executeQuery(queryDelete, valuesDelete);

        return true;
    } catch (error) {
        throw error;
    }
}

const calcularCuotasInteresFijo = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const cuotas = [];
    const montoInt = parseFloat(monto);
    const montoInteres = parseFloat((montoInt * (tasaInteres / 100)).toFixed(2)); // Interés fijo por periodo
    const frecuenciaUnidad =
        frecuenciaPago === frecuenciaPagoEnum.quincenal ? "days" : // Quincenal en días
            frecuenciaPago === frecuenciaPagoEnum.diario ? "days" :
                frecuenciaPago === frecuenciaPagoEnum.semanal ? "weeks" :
                    frecuenciaPago === frecuenciaPagoEnum.anual ? "years" : "months";

    for (let i = 1; i <= totalCuotas; i++) {
        const cantidad = frecuenciaPago === frecuenciaPagoEnum.quincenal ? i * 15 : i; // Quincenal: 15 días por cuota
        const fechaPago = moment(fechaInicio)
            .add(cantidad, frecuenciaUnidad)
            .format("YYYY-MM-DD");

        if (i < totalCuotas) {
            // Cuotas intermedias: Solo interés
            cuotas.push({
                numeroCuota: i,
                fechaPago,
                monto: montoInteres,
            });
        } else {
            // Última cuota: Interés + capital
            cuotas.push({
                numeroCuota: i,
                fechaPago,
                monto: parseFloat((montoInteres + montoInt)).toFixed(2),
            });
        }
    }

    return cuotas;
};

const calcularCuotas = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const cuotas = [];
    const montoInt = parseFloat(monto);
    const montoTotal = montoInt * (1 + tasaInteres / 100); // Monto total incluyendo interés
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
            frecuenciaUnidad = "days";
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
        const cantidad = frecuenciaPago === frecuenciaPagoEnum.quincenal ? i * 15 : i; // Quincenal: 15 días por cuota
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

