/**
 * Tests de integración: refinanciación de préstamos.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { crearPrestamoService, refinanciarPrestamoService } from '../src/services/prestamosServices.js';
import { crearPagoService } from '../src/services/pagosServices.js';

const RUN = `${process.pid}_${Math.floor(process.hrtime()[1])}`;
const empresasCreadas = [];

const seedBase = async () => {
    const { rows: emp } = await pool.query(`INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`, [`Refi_${RUN}`]);
    const empresa_id = Number(emp[0].id);
    empresasCreadas.push(empresa_id);
    const { rows: usr } = await pool.query(
        `INSERT INTO usuarios (empresa_id, rol, nombre, email) VALUES ($1, 'admin', 'Adm', $2) RETURNING id`,
        [empresa_id, `adm_${empresa_id}_${RUN}@test.com`]
    );
    const { rows: cli } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, 'Cli', 'X') RETURNING id`, [empresa_id]
    );
    return { empresa_id, usuario_id: Number(usr[0].id), cliente_id: Number(cli[0].id) };
};

let ctx;
before(async () => { ctx = await seedBase(); });

after(async () => {
    for (const empresa_id of empresasCreadas) {
        await pool.query(`DELETE FROM auditoria WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(
            `DELETE FROM pagos WHERE cuota_id IN (SELECT cu.id FROM cuotas cu JOIN prestamos p ON cu.prestamo_id=p.id WHERE p.empresa_id=$1)`,
            [empresa_id]
        );
        await pool.query(`DELETE FROM cuotas WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id=$1)`, [empresa_id]);
        // Romper el enlace padre->hijo antes de borrar
        await pool.query(`UPDATE prestamos SET prestamo_padre_id = NULL WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM prestamos WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM clientes WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM usuarios WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    await pool.end();
});

const crearPrestamo = (monto, total_cuotas) => crearPrestamoService({
    cliente_id: ctx.cliente_id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
    monto, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
});

const getPrestamo = async (id) => (await pool.query(`SELECT * FROM prestamos WHERE id=$1`, [id])).rows[0];

test('refinanciar capitaliza el saldo + adicional, salda el original y enlaza el nuevo', async () => {
    // Préstamo 1000 en 5 cuotas de 200 (tasa 0). Se paga la 1ª => saldo 800.
    const original = await crearPrestamoService({
        cliente_id: ctx.cliente_id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 1000, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas: 5, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
    });
    const prestamoId = Number(original.prestamo[0].id);
    await crearPagoService({
        cuota_id: original.cuotas[0].id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 200, fecha_pago: '2026-06-01', tipo_pago: 'efectivo',
    });

    // Refinanciar con 200 adicionales, 4 cuotas nuevas
    const res = await refinanciarPrestamoService({
        prestamo_id: prestamoId, empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id,
        monto_adicional: 200, total_cuotas: 4, fecha_inicio: '2026-07-01',
    });

    assert.equal(res.saldo_refinanciado, 800);
    assert.equal(res.nuevo_capital, 1000); // 800 + 200
    assert.equal(res.cuotas.length, 4);

    // El original queda refinanciado y sin saldo
    const orig = await getPrestamo(prestamoId);
    assert.equal(orig.estado_prestamo, 'refinanciado');
    const { rows: saldoRows } = await pool.query(
        `SELECT COALESCE(SUM(monto - monto_pagado),0) AS saldo FROM cuotas WHERE prestamo_id=$1 AND estado IN ('pendiente','parcial')`,
        [prestamoId]
    );
    assert.equal(parseFloat(saldoRows[0].saldo), 0);

    // El nuevo enlaza al original y hereda tasa/frecuencia
    const nuevo = res.prestamo[0];
    assert.equal(Number(nuevo.prestamo_padre_id), prestamoId);
    assert.equal(parseFloat(nuevo.monto), 1000);
    assert.equal(nuevo.frecuencia_pago, 'mensual');
});

test('no se puede refinanciar un préstamo ya refinanciado', async () => {
    const p = await crearPrestamo(500, 2);
    const id = Number(p.prestamo[0].id);
    await refinanciarPrestamoService({ prestamo_id: id, empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id, total_cuotas: 2, fecha_inicio: '2026-07-01' });

    await assert.rejects(
        () => refinanciarPrestamoService({ prestamo_id: id, empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id, total_cuotas: 2, fecha_inicio: '2026-07-01' }),
        /refinanciado/i
    );
});

test('no se puede refinanciar un préstamo de otra empresa', async () => {
    const p = await crearPrestamo(500, 2);
    const id = Number(p.prestamo[0].id);
    await assert.rejects(
        () => refinanciarPrestamoService({ prestamo_id: id, empresa_id: 999999, usuario_id: ctx.usuario_id, total_cuotas: 2, fecha_inicio: '2026-07-01' })
    );
});
