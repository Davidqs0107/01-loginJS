/**
 * Tests de integración de la lógica de pagos contra la base de datos real.
 * Requiere Postgres accesible con las variables de entorno del proyecto (.env).
 *
 * Cubre:
 *  - Aislamiento multi-tenant (una cuota de otra empresa no se puede pagar/eliminar).
 *  - Validación de monto positivo.
 *  - Aplicación de pagos parciales/completos y recalculo de estado de cuota.
 *  - Recalculo automático de estado_prestamo (pendiente -> activo -> completado).
 *  - Multipago repartido en varias cuotas.
 *  - Reversión de estado al eliminar un pago.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import {
    crearPagoService,
    crearMultipagoService,
    eliminarPagoService,
} from '../src/services/pagosServices.js';

const RUN = `${process.pid}_${Math.floor(process.hrtime()[1])}`;
const empresasCreadas = [];

/** Crea empresa + usuario cobrador + cliente y devuelve sus ids. */
const seedEmpresa = async (nombre) => {
    const { rows: emp } = await pool.query(
        `INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`,
        [`${nombre}_${RUN}`]
    );
    const empresa_id = Number(emp[0].id);
    empresasCreadas.push(empresa_id);

    const { rows: usr } = await pool.query(
        `INSERT INTO usuarios (empresa_id, rol, nombre, email)
         VALUES ($1, 'cobrador', 'Cobrador', $2) RETURNING id`,
        [empresa_id, `cobrador_${empresa_id}_${RUN}@test.com`]
    );
    const usuario_id = Number(usr[0].id);

    const { rows: cli } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, 'Juan', 'Perez') RETURNING id`,
        [empresa_id]
    );
    const cliente_id = Number(cli[0].id);

    return { empresa_id, usuario_id, cliente_id };
};

/**
 * Crea un préstamo con N cuotas iguales de `montoCuota` cada una.
 * Devuelve el prestamo_id y el array de cuota_ids en orden.
 */
const seedPrestamo = async ({ empresa_id, usuario_id, cliente_id, numCuotas, montoCuota }) => {
    const { rows: pr } = await pool.query(
        `INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio)
         VALUES ($1, $2, $3, $4, 10, 'mensual', $5, CURRENT_DATE) RETURNING id`,
        [cliente_id, usuario_id, empresa_id, montoCuota * numCuotas, numCuotas]
    );
    const prestamo_id = Number(pr[0].id);

    const cuotaIds = [];
    for (let i = 1; i <= numCuotas; i++) {
        const { rows } = await pool.query(
            `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto)
             VALUES ($1, $2, CURRENT_DATE + $2::int, $3) RETURNING id`,
            [prestamo_id, i, montoCuota]
        );
        cuotaIds.push(Number(rows[0].id));
    }
    return { prestamo_id, cuotaIds };
};

const getCuota = async (id) => (await pool.query(`SELECT * FROM cuotas WHERE id = $1`, [id])).rows[0];
const getEstadoPrestamo = async (id) =>
    (await pool.query(`SELECT estado_prestamo FROM prestamos WHERE id = $1`, [id])).rows[0].estado_prestamo;

let empA, empB;

before(async () => {
    empA = await seedEmpresa('EmpresaA');
    empB = await seedEmpresa('EmpresaB');
});

after(async () => {
    // Limpieza en orden inverso a las FKs
    for (const empresa_id of empresasCreadas) {
        await pool.query(
            `DELETE FROM pagos WHERE cuota_id IN (
                SELECT cu.id FROM cuotas cu JOIN prestamos p ON cu.prestamo_id = p.id WHERE p.empresa_id = $1)`,
            [empresa_id]
        );
        await pool.query(
            `DELETE FROM cuotas WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id = $1)`,
            [empresa_id]
        );
        await pool.query(`DELETE FROM prestamos WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM clientes WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM usuarios WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    await pool.end();
});

// ─────────────────────────────────────────────
// Validación de monto (#2)
// ─────────────────────────────────────────────
test('crearPagoService rechaza monto negativo', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 2, montoCuota: 100 });
    await assert.rejects(
        () => crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: -50, tipo_pago: 'efectivo' }),
        /positivo/i
    );
    // La cuota no debe haber cambiado
    const cuota = await getCuota(cuotaIds[0]);
    assert.equal(parseFloat(cuota.monto_pagado), 0);
    assert.equal(cuota.estado, 'pendiente');
    assert.equal(await getEstadoPrestamo(prestamo_id), 'pendiente');
});

test('crearPagoService rechaza monto cero', async () => {
    const { cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 1, montoCuota: 100 });
    await assert.rejects(
        () => crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 0, tipo_pago: 'efectivo' }),
        /positivo/i
    );
});

// ─────────────────────────────────────────────
// Aislamiento multi-tenant (#2)
// ─────────────────────────────────────────────
test('crearPagoService no permite pagar una cuota de otra empresa', async () => {
    const { cuotaIds } = await seedPrestamo({ ...empB, numCuotas: 1, montoCuota: 100 });
    // empA intenta pagar una cuota de empB
    await assert.rejects(
        () => crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 50, tipo_pago: 'efectivo' }),
        /no se encontro la cuota/i
    );
    const cuota = await getCuota(cuotaIds[0]);
    assert.equal(parseFloat(cuota.monto_pagado), 0);
});

// ─────────────────────────────────────────────
// Aplicación de pagos + estado de cuota y préstamo
// ─────────────────────────────────────────────
test('pago parcial deja cuota parcial y préstamo activo', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 2, montoCuota: 100 });
    await crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 40, tipo_pago: 'efectivo' });

    const cuota = await getCuota(cuotaIds[0]);
    assert.equal(parseFloat(cuota.monto_pagado), 40);
    assert.equal(cuota.estado, 'parcial');
    assert.equal(await getEstadoPrestamo(prestamo_id), 'activo');
});

test('pagar todas las cuotas marca el préstamo como completado', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 2, montoCuota: 100 });
    for (const cuota_id of cuotaIds) {
        await crearPagoService({ cuota_id, usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 100, tipo_pago: 'efectivo' });
    }
    for (const cuota_id of cuotaIds) {
        assert.equal((await getCuota(cuota_id)).estado, 'pagada');
    }
    assert.equal(await getEstadoPrestamo(prestamo_id), 'completado');
});

test('un pago que excede el saldo solo aplica lo necesario', async () => {
    const { cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 1, montoCuota: 100 });
    const res = await crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 150, tipo_pago: 'efectivo' });
    assert.equal(res.montoAplicado, 100);
    assert.match(res.mensajeExcedente, /excedente es 50/);
    assert.equal((await getCuota(cuotaIds[0])).estado, 'pagada');
});

// ─────────────────────────────────────────────
// Multipago (#2)
// ─────────────────────────────────────────────
test('multipago reparte el monto en varias cuotas y respeta la empresa', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 3, montoCuota: 100 });
    // 250 debe cubrir cuota1 (100), cuota2 (100) y dejar cuota3 parcial (50)
    const res = await crearMultipagoService({ prestamo_id, usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, montoTotal: 250, tipo_pago: 'efectivo' });
    assert.equal(res.pagosRealizados.length, 3);

    assert.equal((await getCuota(cuotaIds[0])).estado, 'pagada');
    assert.equal((await getCuota(cuotaIds[1])).estado, 'pagada');
    const c3 = await getCuota(cuotaIds[2]);
    assert.equal(c3.estado, 'parcial');
    assert.equal(parseFloat(c3.monto_pagado), 50);
    assert.equal(await getEstadoPrestamo(prestamo_id), 'activo');
});

test('multipago no toca cuotas de otra empresa', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empB, numCuotas: 2, montoCuota: 100 });
    // empA intenta multipagar un préstamo de empB: no encuentra cuotas -> todo excedente
    const res = await crearMultipagoService({ prestamo_id, usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, montoTotal: 200, tipo_pago: 'efectivo' });
    assert.equal(res.pagosRealizados.length, 0);
    for (const cuota_id of cuotaIds) {
        assert.equal(parseFloat((await getCuota(cuota_id)).monto_pagado), 0);
    }
});

// ─────────────────────────────────────────────
// Eliminar pago revierte estados (#5)
// ─────────────────────────────────────────────
test('eliminar el único pago vuelve la cuota a pendiente (no queda parcial con 0)', async () => {
    const { prestamo_id, cuotaIds } = await seedPrestamo({ ...empA, numCuotas: 1, montoCuota: 100 });
    const { pagoId } = await crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empA.usuario_id, empresa_id: empA.empresa_id, monto: 100, tipo_pago: 'efectivo' });
    assert.equal(await getEstadoPrestamo(prestamo_id), 'completado');

    await eliminarPagoService(pagoId, empA.empresa_id);

    const cuota = await getCuota(cuotaIds[0]);
    assert.equal(parseFloat(cuota.monto_pagado), 0);
    assert.equal(cuota.estado, 'pendiente'); // antes quedaba 'parcial'
    assert.equal(await getEstadoPrestamo(prestamo_id), 'pendiente'); // el préstamo revierte
});

test('eliminar un pago no permite hacerlo desde otra empresa', async () => {
    const { cuotaIds } = await seedPrestamo({ ...empB, numCuotas: 1, montoCuota: 100 });
    const { pagoId } = await crearPagoService({ cuota_id: cuotaIds[0], usuario_id: empB.usuario_id, empresa_id: empB.empresa_id, monto: 100, tipo_pago: 'efectivo' });

    await assert.rejects(() => eliminarPagoService(pagoId, empA.empresa_id));
    // El pago sigue existiendo
    const { rows } = await pool.query(`SELECT 1 FROM pagos WHERE id = $1`, [pagoId]);
    assert.equal(rows.length, 1);
});
