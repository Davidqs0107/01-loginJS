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

// ─────────────────────────────────────────────
// Caso de uso real: préstamo 7000 al 5% en 7 cuotas mensuales, día fijo 22
// (regression test — si alguien toca la lógica de fechas, este test rompe)
// ─────────────────────────────────────────────
test('caso real: préstamo 7000 al 5% en 7 cuotas mensuales con día fijo 22', () => {
    const FECHA_INICIO = '2026-06-22';
    const cuotas = calcularCuotasInteresFijo({
        monto: 7000,
        tasaInteres: 5,
        totalCuotas: 7,
        frecuenciaPago: 'mensual',
        fechaInicio: FECHA_INICIO,
    });

    // 1) Cantidad correcta
    assert.equal(cuotas.length, 7);

    // 2) Todas las cuotas intermedias son solo interés (350 = 7000 * 0.05)
    for (let i = 0; i < cuotas.length - 1; i++) {
        assert.equal(parseFloat(cuotas[i].monto), 350, `cuota ${i + 1} debería ser 350`);
    }
    // 3) Última cuota = interés + capital = 7350
    assert.equal(parseFloat(cuotas[cuotas.length - 1].monto), 7350, 'última cuota debería ser 7350');

    // 4) Total exacto = 9450
    assert.equal(sumaCuotas(cuotas), 9450);

    // 5) Cada cuota cae exactamente el día 22 del mes
    const fechasEsperadas = [
        '2026-07-22', '2026-08-22', '2026-09-22', '2026-10-22',
        '2026-11-22', '2026-12-22', '2027-01-22',
    ];
    for (let i = 0; i < fechasEsperadas.length; i++) {
        assert.equal(cuotas[i].fechaPago, fechasEsperadas[i], `cuota ${i + 1} debería ser ${fechasEsperadas[i]}`);
    }
});

test('caso real: cada cuota preserva el día del mes aunque cambien las estaciones', () => {
    // Verifica que para cualquier día 1-28, las 12 cuotas mensuales caen siempre el mismo día
    for (const dia of [1, 15, 22, 28]) {
        const fechaInicio = `2026-01-${String(dia).padStart(2, '0')}`;
        const cuotas = calcularCuotasInteresFijo({
            monto: 1000, tasaInteres: 1, totalCuotas: 12,
            frecuenciaPago: 'mensual', fechaInicio,
        });
        for (const c of cuotas) {
            const diaCuota = parseInt(c.fechaPago.slice(8, 10), 10);
            assert.equal(diaCuota, dia, `${fechaInicio} → cuota con día ${diaCuota}, esperaba ${dia}`);
        }
    }
});
