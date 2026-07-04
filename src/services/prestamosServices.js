import { frecuenciaPagoEnum, tipoPrestamoInteresEnum } from "../constants/commons.constans.js";
import { notFoundError } from "../constants/notfound.constants.js";
import { buildDynamicQuery, buildQueryUpdate } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeQuery, executeSelect, executeSelectOne } from "../helpers/queryS.js";
import { sanitizeFileName } from "../helpers/sanityFileName.js";
import { executeTransaction } from "../helpers/transactionSql.js";
import { registrarAuditoria } from "./auditoriaService.js";
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

/**
 * Inserta un préstamo y sus cuotas usando un `client` de transacción existente.
 * Extraído para poder reutilizarlo (creación normal y refinanciación) dentro de
 * una única transacción.
 */
const insertarPrestamoConCuotas = async (client, data) => {
    const {
        cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago,
        total_cuotas, fecha_inicio, tipo_prestamo, documento = null, prestamo_padre_id = null,
    } = data;

    const fechaInicioUTC = moment.utc(fecha_inicio).format("YYYY-MM-DD");

    const query = `
        INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo, documento, prestamo_padre_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`;
    const prestamoResult = await client.query(query, [cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fechaInicioUTC, tipo_prestamo, documento, prestamo_padre_id]);
    const idPrestamo = prestamoResult.rows[0].id;

    const calcularCuotasFn =
        tipo_prestamo === tipoPrestamoInteresEnum.fijo ? calcularCuotasInteresFijo : calcularCuotas;
    const cuotas = calcularCuotasFn({
        monto,
        tasaInteres: tasa_interes,
        totalCuotas: total_cuotas,
        frecuenciaPago: frecuencia_pago,
        fechaInicio: fechaInicioUTC,
    });

    // Insertar múltiples cuotas en una sola consulta (parametrizada)
    const cuotasParams = [];
    const cuotasPlaceholders = cuotas.map((cuota, index) => {
        const base = index * 4;
        cuotasParams.push(idPrestamo, index + 1, cuota.fechaPago, cuota.monto);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'pendiente')`;
    });

    const cuotasQuery = `
            INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto, estado)
            VALUES ${cuotasPlaceholders.join(", ")} RETURNING *`;
    const cuotasResult = await client.query(cuotasQuery, cuotasParams);

    return { prestamo: prestamoResult.rows, cuotas: cuotasResult.rows };
};

export const crearPrestamoService = async (data) => {
    try {
        return await executeTransaction(async (client) => insertarPrestamoConCuotas(client, data));
    } catch (error) {
        throw error;
    }
}

/**
 * Refinancia un préstamo: salda las cuotas pendientes del préstamo original
 * (marcándolo 'refinanciado'), capitaliza el saldo pendiente + un monto adicional
 * opcional, y crea un préstamo nuevo enlazado al anterior. Todo en una transacción.
 *
 * @param {object} data
 * @param {number} data.prestamo_id - Préstamo a refinanciar.
 * @param {number} data.empresa_id
 * @param {number} data.usuario_id
 * @param {number} [data.monto_adicional] - Dinero nuevo entregado al cliente (default 0).
 * @param {number} data.total_cuotas - Cuotas del nuevo préstamo.
 * @param {string} data.fecha_inicio - Fecha de inicio del nuevo préstamo.
 * @param {number} [data.tasa_interes] - Si se omite, se hereda del préstamo original.
 * @param {string} [data.frecuencia_pago] - Si se omite, se hereda.
 * @param {string} [data.tipo_prestamo] - Si se omite, se hereda.
 * @param {object} [data.actor] - { ip } para la auditoría.
 */
export const refinanciarPrestamoService = async (data) => {
    const {
        prestamo_id, empresa_id, usuario_id, monto_adicional = 0,
        total_cuotas, fecha_inicio, tasa_interes, frecuencia_pago, tipo_prestamo, actor = {},
    } = data;

    const adicional = parseFloat(monto_adicional) || 0;
    if (adicional < 0) throw new Error("El monto adicional no puede ser negativo.");
    if (!total_cuotas || !fecha_inicio) throw new Error("total_cuotas y fecha_inicio son obligatorios.");

    return await executeTransaction(async (client) => {
        // 1. Cargar el préstamo original validando empresa
        const oldRes = await client.query(
            `SELECT * FROM prestamos WHERE id = $1 AND empresa_id = $2`,
            [prestamo_id, empresa_id]
        );
        if (oldRes.rowCount === 0) throw new Error(notFoundError.prestamoNotFound);
        const original = oldRes.rows[0];
        if (['refinanciado', 'completado'].includes(original.estado_prestamo)) {
            throw new Error(`No se puede refinanciar un préstamo en estado '${original.estado_prestamo}'.`);
        }

        // 2. Saldo pendiente del préstamo original
        const saldoRes = await client.query(
            `SELECT COALESCE(SUM(monto - monto_pagado), 0) AS saldo
             FROM cuotas WHERE prestamo_id = $1 AND estado IN ('pendiente', 'parcial')`,
            [prestamo_id]
        );
        const saldoPendiente = parseFloat(saldoRes.rows[0].saldo);

        // 3. Saldar las cuotas pendientes del original (la deuda pasa al nuevo préstamo)
        await client.query(
            `UPDATE cuotas SET monto_pagado = monto, estado = 'pagada', updated_at = NOW()
             WHERE prestamo_id = $1 AND estado IN ('pendiente', 'parcial')`,
            [prestamo_id]
        );

        // 4. Marcar el original como refinanciado
        await client.query(
            `UPDATE prestamos SET estado_prestamo = 'refinanciado', updated_at = NOW() WHERE id = $1`,
            [prestamo_id]
        );

        // 5. Crear el nuevo préstamo con el saldo capitalizado + adicional
        const nuevoCapital = Math.round((saldoPendiente + adicional) * 100) / 100;
        if (nuevoCapital <= 0) throw new Error("El capital del nuevo préstamo debe ser positivo.");

        const nuevo = await insertarPrestamoConCuotas(client, {
            cliente_id: original.cliente_id,
            usuario_id,
            empresa_id,
            monto: nuevoCapital,
            tasa_interes: tasa_interes ?? original.tasa_interes,
            frecuencia_pago: frecuencia_pago ?? original.frecuencia_pago,
            total_cuotas,
            fecha_inicio,
            tipo_prestamo: tipo_prestamo ?? original.tipo_prestamo,
            prestamo_padre_id: prestamo_id,
        });

        // 6. Auditar
        await registrarAuditoria({
            client,
            empresa_id,
            usuario_id,
            accion: 'refinanciar_prestamo',
            entidad: 'prestamo',
            entidad_id: Number(prestamo_id),
            datos_antes: { saldo_pendiente: saldoPendiente, estado_anterior: original.estado_prestamo },
            datos_despues: { nuevo_prestamo_id: nuevo.prestamo[0].id, nuevo_capital: nuevoCapital, monto_adicional: adicional },
            ip: actor.ip ?? null,
        });

        return {
            prestamo_anterior_id: Number(prestamo_id),
            saldo_refinanciado: saldoPendiente,
            monto_adicional: adicional,
            nuevo_capital: nuevoCapital,
            prestamo: nuevo.prestamo,
            cuotas: nuevo.cuotas,
        };
    });
};

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

export const completarPrestamoService = async (id) => {
    try {
        const result = await executeQuery(
            `UPDATE prestamos SET estado_prestamo = 'completado', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id]
        );
        if (result.length === 0) {
            throw new Error('Préstamo no encontrado');
        }
        return result[0];
    } catch (error) {
        throw error;
    }
};

/**
 * Calcula la fecha de vencimiento de la cuota `numeroCuota` a partir de la fecha
 * de inicio, respetando la unidad y el múltiplo correcto de cada frecuencia.
 * Centraliza la lógica para que interés fijo y cuota constante coincidan.
 */
export const calcularFechaCuota = (fechaInicio, numeroCuota, frecuenciaPago) => {
    let cantidad;
    let unidad;
    switch (frecuenciaPago) {
        case frecuenciaPagoEnum.diario:
            cantidad = numeroCuota; unidad = "days"; break;
        case frecuenciaPagoEnum.semanal:
            cantidad = numeroCuota; unidad = "weeks"; break;
        case frecuenciaPagoEnum.quincenal:
            cantidad = numeroCuota * 15; unidad = "days"; break;
        case frecuenciaPagoEnum.mensual:
            cantidad = numeroCuota; unidad = "months"; break;
        case frecuenciaPagoEnum.trimestral:
            cantidad = numeroCuota * 3; unidad = "months"; break;
        case frecuenciaPagoEnum.semestral:
            cantidad = numeroCuota * 6; unidad = "months"; break;
        case frecuenciaPagoEnum.anual:
            cantidad = numeroCuota; unidad = "years"; break;
        default:
            throw new Error("Frecuencia de pago no válida");
    }
    return moment.utc(fechaInicio).add(cantidad, unidad).format("YYYY-MM-DD");
};

export const calcularCuotasInteresFijo = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const cuotas = [];
    const montoInt = parseFloat(monto);
    const montoInteres = parseFloat((montoInt * (tasaInteres / 100)).toFixed(2)); // Interés fijo por periodo

    for (let i = 1; i <= totalCuotas; i++) {
        const fechaPago = calcularFechaCuota(fechaInicio, i, frecuenciaPago);

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
                monto: parseFloat((montoInteres + montoInt).toFixed(2)),
            });
        }
    }

    return cuotas;
};

export const calcularCuotas = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const cuotas = [];
    const montoInt = parseFloat(monto);
    const montoTotal = montoInt * (1 + tasaInteres / 100); // Monto total incluyendo interés
    const montoCuota = parseFloat((montoTotal / totalCuotas).toFixed(2)); // Redondear a 2 decimales

    let acumulado = 0;
    for (let i = 1; i <= totalCuotas; i++) {
        const fechaPago = calcularFechaCuota(fechaInicio, i, frecuenciaPago);

        // La última cuota absorbe el residuo del redondeo para que
        // la suma de cuotas cuadre exactamente con el monto total.
        let montoActual;
        if (i < totalCuotas) {
            montoActual = montoCuota;
            acumulado += montoCuota;
        } else {
            montoActual = parseFloat((montoTotal - acumulado).toFixed(2));
        }

        cuotas.push({
            numeroCuota: i,
            fechaPago,
            monto: montoActual,
        });
    }

    return cuotas;
};

