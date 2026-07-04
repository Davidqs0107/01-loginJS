import { moraTipos } from "../services/configuracionService.js";

/**
 * Calcula el recargo por mora de una cuota vencida, según la configuración de la empresa.
 * Función pura (sin acceso a BD) para poder testearla y reutilizarla.
 *
 * @param {object} params
 * @param {number} params.saldoPendiente - Saldo aún no pagado de la cuota (monto - monto_pagado).
 * @param {number} params.montoCuota - Monto original de la cuota.
 * @param {number} params.diasAtraso - Días transcurridos desde el vencimiento (>= 0).
 * @param {object} params.config - Configuración de la empresa (getConfiguracionService).
 * @returns {number} Recargo por mora, redondeado a 2 decimales (0 si no aplica).
 */
export const calcularMora = ({ saldoPendiente, montoCuota, diasAtraso, config }) => {
    if (!config || !config.mora_activa) return 0;

    const saldo = parseFloat(saldoPendiente);
    if (isNaN(saldo) || saldo <= 0) return 0;

    const gracia = parseInt(config.mora_dias_gracia ?? 0, 10);
    const diasEfectivos = Math.floor(diasAtraso) - gracia;
    if (diasEfectivos <= 0) return 0;

    const valor = parseFloat(config.mora_valor ?? 0);
    if (isNaN(valor) || valor <= 0) return 0;

    let mora = 0;
    switch (config.mora_tipo) {
        case moraTipos.porcentajeDiarioSaldo:
            // % diario sobre el saldo pendiente, por cada día efectivo de atraso
            mora = saldo * (valor / 100) * diasEfectivos;
            break;
        case moraTipos.porcentajeCuota:
            // % único sobre el monto de la cuota (no se multiplica por días)
            mora = parseFloat(montoCuota) * (valor / 100);
            break;
        case moraTipos.montoFijoDia:
            // monto fijo por cada día efectivo de atraso
            mora = valor * diasEfectivos;
            break;
        default:
            return 0;
    }

    // Aplicar tope máximo si está configurado
    const tope = config.mora_tope !== null && config.mora_tope !== undefined
        ? parseFloat(config.mora_tope)
        : null;
    if (tope !== null && !isNaN(tope) && mora > tope) {
        mora = tope;
    }

    return Math.round(mora * 100) / 100;
};
