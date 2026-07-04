import { calcularMora } from './mora.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Distribuye un pago entre la mora acumulada y el saldo de la cuota (waterfall:
 * primero mora, luego cuota). Función pura para poder testearla.
 *
 * Retrocompatible: si la mora está inactiva (o no aplica), `moraAplicada` es 0 y
 * `montoAplicado` = min(pago, saldo), es decir el comportamiento previo.
 *
 * @param {object} params
 * @param {number} params.montoPago - Monto entregado por el cliente.
 * @param {number} params.restanteCuota - Saldo pendiente de la cuota (monto - monto_pagado).
 * @param {number} params.montoCuota - Monto original de la cuota.
 * @param {number} params.diasAtraso - Días de atraso respecto al vencimiento (>= 0).
 * @param {number} [params.moraCobrada] - Mora ya cobrada previamente para esta cuota.
 * @param {object} params.config - Configuración de la empresa.
 * @returns {{ moraAplicada: number, montoAplicado: number, excedente: number }}
 */
export const calcularAplicacionPago = ({
    montoPago,
    restanteCuota,
    montoCuota,
    diasAtraso,
    moraCobrada = 0,
    config,
}) => {
    const pago = parseFloat(montoPago);
    const restante = parseFloat(restanteCuota);

    const moraTotal = calcularMora({ saldoPendiente: restante, montoCuota, diasAtraso, config });
    const moraPendiente = Math.max(0, round2(moraTotal - parseFloat(moraCobrada)));

    const moraAplicada = Math.min(pago, moraPendiente);
    const disponibleParaCuota = pago - moraAplicada;
    const montoAplicado = Math.min(disponibleParaCuota, restante);
    const excedente = round2(disponibleParaCuota - montoAplicado);

    return {
        moraAplicada: round2(moraAplicada),
        montoAplicado: round2(montoAplicado),
        excedente,
    };
};

/**
 * Días de atraso de una fecha de vencimiento respecto a hoy (0 si no venció).
 */
export const diasDeAtraso = (fechaVencimiento, hoy = new Date()) => {
    const venc = new Date(fechaVencimiento);
    const diffMs = hoy.getTime() - venc.getTime();
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return dias > 0 ? dias : 0;
};
