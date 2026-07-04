/**
 * Tests de integración: portal del cliente (token, resumen, comprobantes, validación).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { crearPrestamoService } from '../src/services/prestamosServices.js';
import {
    generarTokenPortalService, revocarTokenPortalService,
    getPortalResumenService, crearComprobanteService,
} from '../src/services/portalService.js';
import { getComprobantesService, validarComprobanteService } from '../src/services/comprobanteService.js';

const RUN = `${process.pid}_${Math.floor(process.hrtime()[1])}`;
const empresasCreadas = [];
let ctx, prestamo;

before(async () => {
    const { rows: emp } = await pool.query(`INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`, [`Portal_${RUN}`]);
    const empresa_id = Number(emp[0].id);
    empresasCreadas.push(empresa_id);
    const { rows: usr } = await pool.query(
        `INSERT INTO usuarios (empresa_id, rol, nombre, email) VALUES ($1, 'admin', 'Adm', $2) RETURNING id`,
        [empresa_id, `adm_${empresa_id}_${RUN}@test.com`]
    );
    const { rows: cli } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido, telefono) VALUES ($1, 'Juan', 'Perez', '700') RETURNING id`, [empresa_id]
    );
    ctx = { empresa_id, usuario_id: Number(usr[0].id), cliente_id: Number(cli[0].id) };

    // Préstamo 1000 en 5 cuotas de 200 (tasa 0)
    prestamo = await crearPrestamoService({
        cliente_id: ctx.cliente_id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 1000, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas: 5, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
    });
});

after(async () => {
    for (const empresa_id of empresasCreadas) {
        await pool.query(`DELETE FROM comprobantes_pago WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM auditoria WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(
            `DELETE FROM pagos WHERE cuota_id IN (SELECT cu.id FROM cuotas cu JOIN prestamos p ON cu.prestamo_id=p.id WHERE p.empresa_id=$1)`,
            [empresa_id]
        );
        await pool.query(`DELETE FROM cuotas WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id=$1)`, [empresa_id]);
        await pool.query(`DELETE FROM prestamos WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM clientes WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM usuarios WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    await pool.end();
});

test('generar token y consultar el resumen público del portal', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    assert.ok(token && token.length >= 32);

    const resumen = await getPortalResumenService(token);
    assert.equal(resumen.cliente.nombre, 'Juan');
    assert.equal(resumen.total_saldo, 1000); // nada pagado aún
    assert.equal(resumen.prestamos.length, 1);
    assert.equal(resumen.prestamos[0].cuotas.length, 5);
});

test('token inválido es rechazado', async () => {
    await assert.rejects(() => getPortalResumenService('token-inexistente'), /no válido/i);
});

test('revocar token invalida el acceso', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    await revocarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    await assert.rejects(() => getPortalResumenService(token), /no válido/i);
});

test('el cliente sube un comprobante y el staff lo aprueba, generando el pago', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const primeraCuota = prestamo.cuotas[0];

    // Cliente sube comprobante por la 1ª cuota (200)
    const comp = await crearComprobanteService(token, {
        cuota_id: primeraCuota.id, monto: 200, referencia: 'TRANSF-123',
    });
    assert.equal(comp.estado, 'pendiente');
    assert.equal(parseFloat(comp.monto), 200);

    // Staff ve el comprobante pendiente
    const pendientes = await getComprobantesService({ empresa_id: ctx.empresa_id, estado: 'pendiente' });
    assert.ok(pendientes.data.some((c) => c.id === comp.id));

    // Staff lo aprueba -> genera pago real
    const validado = await validarComprobanteService({
        id: comp.id, empresa_id: ctx.empresa_id, estado: 'aprobado', usuario_id: ctx.usuario_id, ip: '127.0.0.1',
    });
    assert.equal(validado.estado, 'aprobado');
    assert.ok(validado.pago_id, 'debe haberse generado un pago');

    // La cuota quedó pagada
    const cuota = (await pool.query(`SELECT * FROM cuotas WHERE id=$1`, [primeraCuota.id])).rows[0];
    assert.equal(cuota.estado, 'pagada');
    assert.equal(parseFloat(cuota.monto_pagado), 200);
});

test('no se puede validar dos veces el mismo comprobante', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const comp = await crearComprobanteService(token, { cuota_id: prestamo.cuotas[1].id, monto: 100, referencia: 'X' });
    await validarComprobanteService({ id: comp.id, empresa_id: ctx.empresa_id, estado: 'rechazado', usuario_id: ctx.usuario_id });
    await assert.rejects(
        () => validarComprobanteService({ id: comp.id, empresa_id: ctx.empresa_id, estado: 'aprobado', usuario_id: ctx.usuario_id }),
        /ya fue/i
    );
});

test('un comprobante con cuota de otro cliente es rechazado', async () => {
    // Otro cliente de la misma empresa con su préstamo
    const { rows: cli2 } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, 'Otro', 'Cliente') RETURNING id`, [ctx.empresa_id]
    );
    const p2 = await crearPrestamoService({
        cliente_id: Number(cli2[0].id), usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 500, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas: 2, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
    });

    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id); // token del cliente 1
    await assert.rejects(
        () => crearComprobanteService(token, { cuota_id: p2.cuotas[0].id, monto: 250 }),
        /no corresponde/i
    );
});
