import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularFiniquito } from '../src/helpers/finiquito.js';

// Préstamo 1000, tasa 5%, 5 cuotas mensuales de interés fijo (50 c/u, última 1050).
const cuotasBase = [
    { numero_cuota: 1, monto: 50, monto_pagado: 50, estado: 'pagada' },
    { numero_cuota: 2, monto: 50, monto_pagado: 50, estado: 'pagada' },
    { numero_cuota: 3, monto: 50, monto_pagado: 0, estado: 'pendiente' },
    { numero_cuota: 4, monto: 50, monto_pagado: 0, estado: 'pendiente' },
    { numero_cuota: 5, monto: 1050, monto_pagado: 0, estado: 'pendiente' },
];

test('caso de negocio: N=1, 2 cuotas pagadas', () => {
    const r = calcularFiniquito({ cuotas: cuotasBase, montoPrestamo: 1000, cuotasInteresACobrar: 1 });
    assert.equal(r.capital_pendiente, 1000);
    assert.equal(r.interes_a_cobrar, 50);
    assert.equal(r.interes_condonado, 100);
    assert.equal(r.total_finiquito, 1050);
    assert.deepEqual(r.detalle, [
        { numero_cuota: 3, cobrar: 50, condonar: 0 },
        { numero_cuota: 4, cobrar: 0, condonar: 50 },
        { numero_cuota: 5, cobrar: 1000, condonar: 50 },
    ]);
});

test('N=2: cobra interés de las 2 próximas cuotas', () => {
    const r = calcularFiniquito({ cuotas: cuotasBase, montoPrestamo: 1000, cuotasInteresACobrar: 2 });
    assert.equal(r.capital_pendiente, 1000);
    assert.equal(r.interes_a_cobrar, 100); // cuotas 3 y 4
    assert.equal(r.interes_condonado, 50); // cuota 5
    assert.equal(r.total_finiquito, 1100);
});

test('N mayor que cuotas de interés pendientes: cobra todo, condona 0', () => {
    const r = calcularFiniquito({ cuotas: cuotasBase, montoPrestamo: 1000, cuotasInteresACobrar: 10 });
    assert.equal(r.interes_a_cobrar, 150);
    assert.equal(r.interes_condonado, 0);
    assert.equal(r.total_finiquito, 1150);
});

test('cuota parcial: cuenta su restante de interés', () => {
    const cuotas = cuotasBase.map((c) =>
        c.numero_cuota === 3 ? { ...c, monto_pagado: 20, estado: 'parcial' } : c
    );
    const r = calcularFiniquito({ cuotas, montoPrestamo: 1000, cuotasInteresACobrar: 1 });
    assert.equal(r.interes_a_cobrar, 30); // 50 - 20 ya pagado
    assert.deepEqual(r.detalle[0], { numero_cuota: 3, cobrar: 30, condonar: 0 });
});

test('última cuota con pago parcial (menor al interés): capital completo + resto de interés', () => {
    // Todo pagado salvo la última, que tiene un pago parcial de 20 (cubre parte del interés de 50).
    const cuotas = [
        { numero_cuota: 1, monto: 50, monto_pagado: 50, estado: 'pagada' },
        { numero_cuota: 2, monto: 50, monto_pagado: 50, estado: 'pagada' },
        { numero_cuota: 3, monto: 50, monto_pagado: 50, estado: 'pagada' },
        { numero_cuota: 4, monto: 50, monto_pagado: 50, estado: 'pagada' },
        { numero_cuota: 5, monto: 1050, monto_pagado: 20, estado: 'parcial' },
    ];
    const r = calcularFiniquito({ cuotas, montoPrestamo: 1000, cuotasInteresACobrar: 1 });
    assert.equal(r.capital_pendiente, 980); // min(20,1000) ya "pagado" de capital
    assert.equal(r.interes_a_cobrar, 30); // 50 - 20
    assert.equal(r.interes_condonado, 0);
    assert.equal(r.total_finiquito, 1010);
    assert.deepEqual(r.detalle, [{ numero_cuota: 5, cobrar: 1010, condonar: 0 }]);
});

test('todo pagado: total 0', () => {
    const cuotas = cuotasBase.map((c) => ({ ...c, monto_pagado: c.monto, estado: 'pagada' }));
    const r = calcularFiniquito({ cuotas, montoPrestamo: 1000, cuotasInteresACobrar: 1 });
    assert.equal(r.total_finiquito, 0);
    assert.equal(r.capital_pendiente, 0);
    assert.equal(r.interes_a_cobrar, 0);
    assert.deepEqual(r.detalle, []);
});
