import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularMora } from '../src/helpers/mora.js';

const base = {
    mora_activa: true,
    mora_tipo: 'porcentaje_cuota',
    mora_valor: 5,
    mora_dias_gracia: 0,
    mora_tope: null,
    incumplido_dias: 90,
};

test('mora inactiva devuelve 0', () => {
    const config = { ...base, mora_activa: false };
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 30, config }), 0);
});

test('porcentaje_cuota: % único sobre la cuota, sin importar los días', () => {
    const config = { ...base, mora_tipo: 'porcentaje_cuota', mora_valor: 5 };
    assert.equal(calcularMora({ saldoPendiente: 800, montoCuota: 1000, diasAtraso: 3, config }), 50);
    assert.equal(calcularMora({ saldoPendiente: 800, montoCuota: 1000, diasAtraso: 40, config }), 50);
});

test('porcentaje_diario_saldo: % diario sobre el saldo por día de atraso', () => {
    const config = { ...base, mora_tipo: 'porcentaje_diario_saldo', mora_valor: 1 };
    // 1000 * 1% * 10 días = 100
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 10, config }), 100);
});

test('monto_fijo_dia: monto fijo por cada día de atraso', () => {
    const config = { ...base, mora_tipo: 'monto_fijo_dia', mora_valor: 5 };
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 10, config }), 50);
});

test('días de gracia se descuentan del atraso', () => {
    const config = { ...base, mora_tipo: 'monto_fijo_dia', mora_valor: 10, mora_dias_gracia: 3 };
    // 5 días - 3 de gracia = 2 días efectivos * 10 = 20
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 5, config }), 20);
});

test('atraso dentro del periodo de gracia no genera mora', () => {
    const config = { ...base, mora_tipo: 'monto_fijo_dia', mora_valor: 10, mora_dias_gracia: 5 };
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 5, config }), 0);
});

test('tope máximo limita la mora', () => {
    const config = { ...base, mora_tipo: 'porcentaje_diario_saldo', mora_valor: 1, mora_tope: 200 };
    // 1000 * 1% * 100 = 1000, pero el tope es 200
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 100, config }), 200);
});

test('saldo pendiente <= 0 devuelve 0', () => {
    assert.equal(calcularMora({ saldoPendiente: 0, montoCuota: 1000, diasAtraso: 30, config: base }), 0);
});

test('valor 0 devuelve 0', () => {
    const config = { ...base, mora_valor: 0 };
    assert.equal(calcularMora({ saldoPendiente: 1000, montoCuota: 1000, diasAtraso: 30, config }), 0);
});
