import crypto from 'crypto';
import { executeQuery } from "../helpers/queryS.js";
import { getConfiguracionService } from "./configuracionService.js";
import { calcularMora } from "../helpers/mora.js";

/** Genera (o rota) el token de acceso al portal de un cliente. Devuelve el token. */
export const generarTokenPortalService = async (cliente_id, empresa_id) => {
    const token = crypto.randomBytes(24).toString('hex');
    const rows = await executeQuery(
        `UPDATE clientes SET portal_token = $1, updated_at = NOW()
         WHERE id = $2 AND empresa_id = $3
         RETURNING id, portal_token`,
        [token, cliente_id, empresa_id]
    );
    if (rows.length === 0) throw new Error('Cliente no encontrado.');
    return rows[0].portal_token;
};

/** Revoca el acceso al portal (borra el token). */
export const revocarTokenPortalService = async (cliente_id, empresa_id) => {
    const rows = await executeQuery(
        `UPDATE clientes SET portal_token = NULL, updated_at = NOW()
         WHERE id = $1 AND empresa_id = $2 RETURNING id`,
        [cliente_id, empresa_id]
    );
    if (rows.length === 0) throw new Error('Cliente no encontrado.');
    return true;
};

/** Resuelve un token de portal a su cliente (o null). */
const clientePorToken = async (token) => {
    if (!token) return null;
    const rows = await executeQuery(
        `SELECT id, empresa_id, nombre, apellido, telefono, email FROM clientes WHERE portal_token = $1 AND estado = true`,
        [token]
    );
    return rows[0] || null;
};

/**
 * Resumen público del portal: datos del cliente, sus préstamos con cuotas,
 * saldo total y mora acumulada según la configuración de la empresa.
 */
export const getPortalResumenService = async (token) => {
    const cliente = await clientePorToken(token);
    if (!cliente) throw new Error('Acceso no válido.');

    const empresaRows = await executeQuery(
        `SELECT nombre, telefono, direccion FROM empresas WHERE id = $1`, [cliente.empresa_id]
    );

    const prestamos = await executeQuery(
        `SELECT p.id, p.monto, p.tasa_interes, p.frecuencia_pago, p.estado_prestamo, p.fecha_inicio
         FROM prestamos p
         WHERE p.cliente_id = $1 AND p.empresa_id = $2 AND p.estado_prestamo <> 'refinanciado'
         ORDER BY p.fecha_inicio DESC`,
        [cliente.id, cliente.empresa_id]
    );

    const config = await getConfiguracionService(cliente.empresa_id);

    let totalSaldo = 0;
    let totalMora = 0;

    for (const p of prestamos) {
        const cuotas = await executeQuery(
            `SELECT id, numero_cuota, fecha_pago, monto, monto_pagado, estado,
                    GREATEST(CURRENT_DATE - fecha_pago, 0)::int AS dias_atraso
             FROM cuotas WHERE prestamo_id = $1 ORDER BY numero_cuota ASC`,
            [p.id]
        );
        let saldoPrestamo = 0;
        p.cuotas = cuotas.map((c) => {
            const saldo = parseFloat(c.monto) - parseFloat(c.monto_pagado);
            const esVencida = ['pendiente', 'parcial'].includes(c.estado) && c.dias_atraso > 0;
            const mora = esVencida ? calcularMora({ saldoPendiente: saldo, montoCuota: c.monto, diasAtraso: c.dias_atraso, config }) : 0;
            if (['pendiente', 'parcial'].includes(c.estado)) {
                saldoPrestamo += saldo;
                totalMora += mora;
            }
            return { ...c, saldo: Math.round(saldo * 100) / 100, mora };
        });
        p.saldo = Math.round(saldoPrestamo * 100) / 100;
        totalSaldo += saldoPrestamo;
    }

    return {
        cliente: { nombre: cliente.nombre, apellido: cliente.apellido, telefono: cliente.telefono, email: cliente.email },
        empresa: empresaRows[0] || null,
        moneda: config.moneda,
        total_saldo: Math.round(totalSaldo * 100) / 100,
        total_mora: Math.round(totalMora * 100) / 100,
        prestamos,
    };
};

/**
 * El cliente sube un comprobante de pago desde el portal. Queda 'pendiente'
 * hasta que el staff lo valide. Valida que la cuota/préstamo sean del cliente.
 */
export const crearComprobanteService = async (token, { cuota_id, prestamo_id, monto, referencia, archivo }) => {
    const cliente = await clientePorToken(token);
    if (!cliente) throw new Error('Acceso no válido.');

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser un número positivo.');

    let prestamoId = prestamo_id || null;

    // Si se indica una cuota, validar que pertenezca a un préstamo del cliente y derivar el préstamo
    if (cuota_id) {
        const val = await executeQuery(
            `SELECT p.id AS prestamo_id FROM cuotas cu
             JOIN prestamos p ON cu.prestamo_id = p.id
             WHERE cu.id = $1 AND p.cliente_id = $2 AND p.empresa_id = $3`,
            [cuota_id, cliente.id, cliente.empresa_id]
        );
        if (val.length === 0) throw new Error('La cuota no corresponde a este cliente.');
        prestamoId = val[0].prestamo_id;
    }

    const rows = await executeQuery(
        `INSERT INTO comprobantes_pago (empresa_id, cliente_id, prestamo_id, cuota_id, monto, referencia, archivo, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente')
         RETURNING *`,
        [cliente.empresa_id, cliente.id, prestamoId, cuota_id || null, montoNum, referencia || null, archivo || null]
    );
    return rows[0];
};
