/**
 * Template de servicio de préstamo
 * 
 * Copia y adapta según el módulo necesario.
 * Reemplazar MODULE_NAME con el nombre real del módulo.
 */

import moment from "moment";
import { executeTransaction } from "../helpers/transactionSql.js";
import { executeSelect, executeSelectOne, executeInsert } from "../helpers/queryS.js";
import { frecuenciaPagoEnum, tipoPrestamoInteresEnum, estadoPrestamo } from "../constants/commons.constans.js";
import { notFoundError } from "../constants/notfound.constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// CREAR PRÉSTAMO + CUOTAS (transacción atómica)
// ─────────────────────────────────────────────────────────────────────────────

export const crearPrestamoService = async (data) => {
    const {
        cliente_id, usuario_id, empresa_id,
        monto, tasa_interes, frecuencia_pago,
        total_cuotas, fecha_inicio, tipo_prestamo, documento
    } = data;

    // Normalizar fecha a UTC para evitar desfases de zona horaria
    const fechaInicioUTC = moment.utc(fecha_inicio).format("YYYY-MM-DD");

    return await executeTransaction(async (client) => {
        // 1. Insertar el préstamo
        const prestamoResult = await client.query(
            `INSERT INTO prestamos
             (cliente_id, usuario_id, empresa_id, monto, tasa_interes,
              frecuencia_pago, total_cuotas, fecha_inicio, tipo_prestamo, documento)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [cliente_id, usuario_id, empresa_id, monto, tasa_interes,
                frecuencia_pago, total_cuotas, fechaInicioUTC, tipo_prestamo, documento]
        );
        const idPrestamo = prestamoResult.rows[0].id;

        // 2. Calcular cuotas según tipo de interés
        const calcularFn = tipo_prestamo === tipoPrestamoInteresEnum.fijo
            ? calcularCuotasInteresFijo
            : calcularCuotasAmortizacion;

        const cuotas = calcularFn({ monto, tasaInteres: tasa_interes, totalCuotas: total_cuotas, frecuenciaPago: frecuencia_pago, fechaInicio: fechaInicioUTC });

        // 3. Insertar todas las cuotas en batch (una sola query)
        const valoresCuotas = cuotas
            .map((c, i) => `(${idPrestamo}, ${i + 1}, '${c.fechaPago}', ${c.monto}, 'pendiente')`)
            .join(", ");

        const cuotasResult = await client.query(
            `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto, estado)
             VALUES ${valoresCuotas} RETURNING *`
        );

        return { prestamo: prestamoResult.rows, cuotas: cuotasResult.rows };
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITMOS DE CÁLCULO DE CUOTAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipo "cuota": reparte monto + interés en cuotas iguales
 * montoTotal = monto * (1 + tasa/100)
 * montoCuota = montoTotal / totalCuotas
 */
const calcularCuotasAmortizacion = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const montoTotal = parseFloat(monto) * (1 + tasaInteres / 100);
    const montoCuota = parseFloat((montoTotal / totalCuotas).toFixed(2));
    return generarFechas(totalCuotas, frecuenciaPago, fechaInicio).map((fechaPago, i) => ({
        numeroCuota: i + 1,
        fechaPago,
        monto: montoCuota,
    }));
};

/**
 * Tipo "fijo": cuotas intermedias = solo interés, última = interés + capital
 * montoInteres = monto * (tasa/100)
 */
const calcularCuotasInteresFijo = ({ monto, tasaInteres, totalCuotas, frecuenciaPago, fechaInicio }) => {
    const montoInt = parseFloat(monto);
    const montoInteres = parseFloat((montoInt * (tasaInteres / 100)).toFixed(2));
    return generarFechas(totalCuotas, frecuenciaPago, fechaInicio).map((fechaPago, i) => ({
        numeroCuota: i + 1,
        fechaPago,
        monto: i < totalCuotas - 1
            ? montoInteres
            : parseFloat((montoInteres + montoInt).toFixed(2)),
    }));
};

/** Genera array de fechas de pago según frecuencia */
const generarFechas = (totalCuotas, frecuenciaPago, fechaInicio) => {
    const mapa = {
        [frecuenciaPagoEnum.diario]: { unidad: "days", mult: 1 },
        [frecuenciaPagoEnum.semanal]: { unidad: "weeks", mult: 1 },
        [frecuenciaPagoEnum.quincenal]: { unidad: "days", mult: 15 },
        [frecuenciaPagoEnum.mensual]: { unidad: "months", mult: 1 },
        [frecuenciaPagoEnum.trimestral]: { unidad: "months", mult: 3 },
        [frecuenciaPagoEnum.semestral]: { unidad: "months", mult: 6 },
        [frecuenciaPagoEnum.anual]: { unidad: "years", mult: 1 },
    };
    const { unidad, mult } = mapa[frecuenciaPago] || (() => { throw new Error("Frecuencia no válida"); })();
    return Array.from({ length: totalCuotas }, (_, i) =>
        moment.utc(fechaInicio).add((i + 1) * mult, unidad).format("YYYY-MM-DD")
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTAS
// ─────────────────────────────────────────────────────────────────────────────

/** Listado paginado con saldo calculado */
export const getPrestamosService = async ({ empresa_id, fecha_inicio, fecha_fin, searchTerm, page = 1, pageSize = 10 }) => {
    let query = `
        SELECT p.*,
               c.nombre, c.apellido, c.telefono,
               COALESCE(SUM(cu.monto), 0)          as monto_total_cuotas,
               COALESCE(SUM(cu.monto_pagado), 0)   as monto_pagado,
               COALESCE(SUM(cu.monto), 0) - COALESCE(SUM(cu.monto_pagado), 0) as saldo
        FROM prestamos p
        JOIN clientes c  ON p.cliente_id  = c.id
        LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
        WHERE p.empresa_id = $1 AND p.estado = true AND c.estado = true
    `;
    const params = [empresa_id];

    if (searchTerm) {
        params.push(`%${searchTerm}%`, searchTerm);
        query += ` AND (c.nombre ILIKE $${params.length - 1} OR c.apellido ILIKE $${params.length - 1} OR c.ci = $${params.length})`;
    } else {
        params.push(fecha_inicio, fecha_fin);
        query += ` AND p.fecha_inicio BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    query += ` GROUP BY p.id, c.id`;

    return await executeSelect(query, params, parseInt(page), parseInt(pageSize));
};

/** Detalle por ID con cuotas opcionales */
export const getPrestamoByIdService = async (id, empresa_id, mostrarCuotas = false) => {
    const rows = await executeSelectOne(
        `SELECT p.*, c.nombre, c.apellido, c.telefono, c.ci, c.latitud, c.longitud
         FROM prestamos p JOIN clientes c ON p.cliente_id = c.id
         WHERE p.id = $1 AND p.empresa_id = $2`,
        [id, empresa_id]
    );
    if (rows.length === 0) throw new Error(notFoundError.prestamoNotFound);

    if (mostrarCuotas) {
        const { data } = await executeSelect(
            `SELECT * FROM cuotas WHERE prestamo_id = $1 ORDER BY numero_cuota ASC`,
            [id], 1, 10000
        );
        rows[0].cuotas = data;
    }
    return rows[0];
};
