import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    calcularFechaCuota,
    calcularCuotas,
    calcularCuotasInteresFijo,
} from '../src/services/prestamosServices.js';

const FECHA = '2026-01-01';
const round2 = (n) => Math.round(n * 100) / 100;
const sumaCuotas = (cuotas) => round2(cuotas.reduce((acc, c) => acc + parseFloat(c.monto), 0));

// ─────────────────────────────────────────────
// calcularFechaCuota — fechas por frecuencia (#1)
// ─────────────────────────────────────────────
test('calcularFechaCuota: diario suma días', () => {
    assert.equal(calcularFechaCuota(FECHA, 1, 'diario'), '2026-01-02');
    assert.equal(calcularFechaCuota(FECHA, 3, 'diario'), '2026-01-04');
});

test('calcularFechaCuota: semanal suma semanas', () => {
    assert.equal(calcularFechaCuota(FECHA, 2, 'semanal'), '2026-01-15');
});

test('calcularFechaCuota: quincenal suma 15 días por cuota', () => {
    assert.equal(calcularFechaCuota(FECHA, 1, 'quincenal'), '2026-01-16');
    assert.equal(calcularFechaCuota(FECHA, 2, 'quincenal'), '2026-01-31');
});

test('calcularFechaCuota: mensual suma meses', () => {
    assert.equal(calcularFechaCuota(FECHA, 1, 'mensual'), '2026-02-01');
    assert.equal(calcularFechaCuota(FECHA, 3, 'mensual'), '2026-04-01');
});

test('calcularFechaCuota: trimestral suma 3 meses por cuota (fix del bug)', () => {
    // Antes generaba fechas mensuales; ahora deben ser trimestrales.
    assert.equal(calcularFechaCuota(FECHA, 1, 'trimestral'), '2026-04-01');
    assert.equal(calcularFechaCuota(FECHA, 2, 'trimestral'), '2026-07-01');
});

test('calcularFechaCuota: semestral suma 6 meses por cuota (fix del bug)', () => {
    assert.equal(calcularFechaCuota(FECHA, 1, 'semestral'), '2026-07-01');
    assert.equal(calcularFechaCuota(FECHA, 2, 'semestral'), '2027-01-01');
});

test('calcularFechaCuota: anual suma años', () => {
    assert.equal(calcularFechaCuota(FECHA, 1, 'anual'), '2027-01-01');
});

test('calcularFechaCuota: frecuencia inválida lanza error', () => {
    assert.throws(() => calcularFechaCuota(FECHA, 1, 'inexistente'), /Frecuencia de pago no válida/);
});

// ─────────────────────────────────────────────
// calcularCuotas — cuota constante (#4 residuo)
// ─────────────────────────────────────────────
test('calcularCuotas: genera el número correcto de cuotas', () => {
    const cuotas = calcularCuotas({ monto: 10000, tasaInteres: 10, totalCuotas: 3, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    assert.equal(cuotas.length, 3);
});

test('calcularCuotas: la suma cuadra exactamente con el total (residuo en última cuota)', () => {
    // 1000 al 10% = 1100 en 7 cuotas. 1100/7 = 157.142857...
    const cuotas = calcularCuotas({ monto: 1000, tasaInteres: 10, totalCuotas: 7, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    assert.equal(sumaCuotas(cuotas), 1100.00);
    // Las 6 primeras iguales, la última absorbe el residuo
    assert.equal(parseFloat(cuotas[0].monto), 157.14);
    assert.equal(parseFloat(cuotas[6].monto), 157.16);
});

test('calcularCuotas: caso 10000 al 10% en 3 cuotas cuadra a 11000', () => {
    const cuotas = calcularCuotas({ monto: 10000, tasaInteres: 10, totalCuotas: 3, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    assert.equal(sumaCuotas(cuotas), 11000.00);
});

test('calcularCuotas: todas las cuotas tienen monto numérico', () => {
    const cuotas = calcularCuotas({ monto: 5000, tasaInteres: 15, totalCuotas: 5, frecuenciaPago: 'semanal', fechaInicio: FECHA });
    for (const c of cuotas) assert.equal(typeof c.monto, 'number');
});

// ─────────────────────────────────────────────
// calcularCuotasInteresFijo — interés por periodo
// ─────────────────────────────────────────────
test('calcularCuotasInteresFijo: intermedias solo interés, última interés + capital', () => {
    const cuotas = calcularCuotasInteresFijo({ monto: 10000, tasaInteres: 10, totalCuotas: 3, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    assert.equal(parseFloat(cuotas[0].monto), 1000);   // solo interés
    assert.equal(parseFloat(cuotas[1].monto), 1000);   // solo interés
    assert.equal(parseFloat(cuotas[2].monto), 11000);  // interés + capital
});

test('calcularCuotasInteresFijo: la última cuota es número (no string) (#6)', () => {
    const cuotas = calcularCuotasInteresFijo({ monto: 10000, tasaInteres: 10, totalCuotas: 3, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    assert.equal(typeof cuotas[2].monto, 'number');
});

test('calcularCuotasInteresFijo: total devuelto = capital + interés * nº cuotas', () => {
    const cuotas = calcularCuotasInteresFijo({ monto: 10000, tasaInteres: 10, totalCuotas: 4, frecuenciaPago: 'mensual', fechaInicio: FECHA });
    // interés 1000 x 4 + capital 10000 = 14000
    assert.equal(sumaCuotas(cuotas), 14000.00);
});
