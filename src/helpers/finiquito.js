/**
 * Calcula el finiquito de cancelación anticipada de un préstamo de interés fijo.
 * Función pura (sin acceso a BD) para poder testearla y reutilizarla.
 *
 * Regla de negocio: el cliente liquida capital pendiente + interés de las
 * próximas `cuotasInteresACobrar` cuotas no pagadas; el resto del interés
 * pendiente se condona. En un préstamo 'fijo' el capital vive únicamente en
 * la última cuota (las demás son solo interés).
 *
 * @param {object} params
 * @param {Array<{numero_cuota:number, monto:number|string, monto_pagado:number|string, estado:string}>} params.cuotas
 *        Cuotas del préstamo, ordenadas ascendentemente por numero_cuota.
 * @param {number|string} params.montoPrestamo - Capital original del préstamo.
 * @param {number} [params.cuotasInteresACobrar] - N: cantidad de cuotas de interés a cobrar (default 1).
 * @returns {{
 *   capital_pendiente:number, interes_a_cobrar:number, interes_condonado:number,
 *   total_finiquito:number, detalle:Array<{numero_cuota:number, cobrar:number, condonar:number}>
 * }}
 */
export const calcularFiniquito = ({ cuotas, montoPrestamo, cuotasInteresACobrar = 1 }) => {
    const round2 = (n) => Math.round(n * 100) / 100;
    const monto = parseFloat(montoPrestamo);
    const N = Math.max(1, parseInt(cuotasInteresACobrar, 10) || 1);

    const ultimaCuota = cuotas[cuotas.length - 1];
    const numeroUltima = ultimaCuota?.numero_cuota;
    const montoPagadoUltima = parseFloat(ultimaCuota?.monto_pagado || 0);
    const capitalPendiente = round2(monto - Math.min(montoPagadoUltima, monto));

    const noPagadas = cuotas.filter((c) => c.estado === 'pendiente' || c.estado === 'parcial');

    let interesACobrar = 0;
    let interesCondonado = 0;
    const detalle = noPagadas.map((c, idx) => {
        const esUltima = c.numero_cuota === numeroUltima;
        const montoCuota = parseFloat(c.monto);
        const montoPagado = parseFloat(c.monto_pagado || 0);

        // Interés pendiente: en cuotas normales, todo lo que falta de la cuota
        // (son solo-interés). En la última, el pago va primero a interés, luego a capital.
        const interesPendiente = esUltima
            ? Math.max(0, (montoCuota - monto) - montoPagado)
            : Math.max(0, montoCuota - montoPagado);

        const dentroDeN = idx < N;
        const cobrarInteres = dentroDeN ? interesPendiente : 0;
        const condonarInteres = dentroDeN ? 0 : interesPendiente;

        interesACobrar += cobrarInteres;
        interesCondonado += condonarInteres;

        // El capital nunca se condona: si es la última cuota, se cobra siempre.
        const capitalCuota = esUltima ? capitalPendiente : 0;

        return {
            numero_cuota: c.numero_cuota,
            cobrar: round2(cobrarInteres + capitalCuota),
            condonar: round2(condonarInteres),
        };
    });

    interesACobrar = round2(interesACobrar);
    interesCondonado = round2(interesCondonado);

    return {
        capital_pendiente: capitalPendiente,
        interes_a_cobrar: interesACobrar,
        interes_condonado: interesCondonado,
        total_finiquito: round2(capitalPendiente + interesACobrar),
        detalle,
    };
};
