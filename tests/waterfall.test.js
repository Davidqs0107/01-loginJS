import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAplicacionPago, diasDeAtraso } from '../src/helpers/pagoWaterfall.js';

const moraFija = {
    mora_activa: true, mora_tipo: 'monto_fijo_dia', mora_valor: 10,
    mora_dias_gracia: 0, mora_tope: null,
};
const sinMora = { mora_activa: false };

test('mora inactiva: todo el pago va a la cuota (retrocompatible)', () => {
    const r = calcularAplicacionPago({ montoPago: 100, restanteCuota: 200, montoCuota: 200, diasAtraso: 5, config: sinMora });
    assert.deepEqual(r, { moraAplicada: 0, montoAplicado: 100, excedente: 0 });
});

test('waterfall: primero mora, luego cuota', () => {
    // 5 días * 10 = 50 de mora
    const r = calcularAplicacionPago({ montoPago: 100, restanteCuota: 200, montoCuota: 200, diasAtraso: 5, config: moraFija });
    assert.equal(r.moraAplicada, 50);
    assert.equal(r.montoAplicado, 50);
    assert.equal(r.excedente, 0);
});

test('pago que cubre mora, cuota y deja excedente', () => {
    const r = calcularAplicacionPago({ montoPago: 300, restanteCuota: 200, montoCuota: 200, diasAtraso: 5, config: moraFija });
    assert.equal(r.moraAplicada, 50);
    assert.equal(r.montoAplicado, 200);
    assert.equal(r.excedente, 50);
});

test('pago menor a la mora: se consume todo en mora, nada a la cuota', () => {
    const r = calcularAplicacionPago({ montoPago: 30, restanteCuota: 200, montoCuota: 200, diasAtraso: 5, config: moraFija });
    assert.equal(r.moraAplicada, 30);
    assert.equal(r.montoAplicado, 0);
    assert.equal(r.excedente, 0);
});

test('mora ya cobrada previamente reduce la mora pendiente', () => {
    const r = calcularAplicacionPago({
        montoPago: 100, restanteCuota: 200, montoCuota: 200, diasAtraso: 5, moraCobrada: 30, config: moraFija,
    });
    // mora total 50 - 30 ya cobrada = 20 pendiente
    assert.equal(r.moraAplicada, 20);
    assert.equal(r.montoAplicado, 80);
});

test('diasDeAtraso: fecha futura da 0, fecha pasada da días positivos', () => {
    const hoy = new Date('2026-07-10T12:00:00Z');
    assert.equal(diasDeAtraso('2026-07-20', hoy), 0);       // no vencida
    assert.equal(diasDeAtraso('2026-07-05', hoy), 5);       // 5 días de atraso
});
