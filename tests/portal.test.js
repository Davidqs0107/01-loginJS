/**
 * Tests de integración: portal del cliente (token, resumen, comprobantes, validación).
 */
// Apuntar el SMTP a un puerto que rechaza conexiones: el envío de email fallará
// rápido sin necesidad de un servidor real. La función notificarClientePorComprobante
// registra igualmente la fila en `notificaciones_enviadas` con estado='fallido'.
process.env.EMAIL_HOST = '127.0.0.1';
process.env.EMAIL_PORT = '1';
process.env.EMAIL_USER = 'test@hatria.local';
process.env.EMAIL_PASSWORD = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { crearPrestamoService } from '../src/services/prestamosServices.js';
import {
    generarTokenPortalService, revocarTokenPortalService,
    getPortalResumenService, crearComprobanteService,
} from '../src/services/portalService.js';
import {
    getComprobantesService, validarComprobanteService,
    notificarClientePorComprobante,
} from '../src/services/comprobanteService.js';

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
        `INSERT INTO clientes (empresa_id, nombre, apellido, telefono, email)
         VALUES ($1, 'Juan', 'Perez', '700', $2) RETURNING id`,
        [empresa_id, `juan_${RUN}@hatria.test`]
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
        await pool.query(`DELETE FROM notificaciones_enviadas WHERE cliente_id IN (SELECT id FROM clientes WHERE empresa_id = $1)`, [empresa_id]);
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

test('comprobante sin cuota_id es rechazado', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    await assert.rejects(
        () => crearComprobanteService(token, { monto: 100 }),
        /indicar la cuota/i
    );
});

test('mismo request_id devuelve el comprobante existente (idempotencia estricta)', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const data = { cuota_id: prestamo.cuotas[2].id, monto: 50, referencia: 'IDEM-1', request_id: 'uuid-strict-1' };
    const a = await crearComprobanteService(token, data);
    const b = await crearComprobanteService(token, data);
    assert.equal(a.id, b.id, 'el segundo envío debe devolver el mismo comprobante');
    // Solo debe existir un comprobante con ese request_id
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM comprobantes_pago WHERE cliente_id = $1 AND request_id = $2`,
        [ctx.cliente_id, 'uuid-strict-1']
    );
    assert.equal(rows[0].c, 1);
});

test('sin request_id, heurística 5 min deduplica por (cliente, cuota, monto, referencia)', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const data = { cuota_id: prestamo.cuotas[3].id, monto: 75, referencia: 'TRF-HEUR' };
    const a = await crearComprobanteService(token, data);
    const b = await crearComprobanteService(token, data);
    assert.equal(a.id, b.id, 'la heurística debe deduplicar envíos casi simultáneos');
});

test('request_id de otro cliente no colisiona', async () => {
    // Cliente 2 con su propio préstamo
    const { rows: cli2 } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, 'Otro2', 'Cliente2') RETURNING id`, [ctx.empresa_id]
    );
    const p2 = await crearPrestamoService({
        cliente_id: Number(cli2[0].id), usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 300, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas: 1, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
    });
    const token1 = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const token2 = await generarTokenPortalService(Number(cli2[0].id), ctx.empresa_id);
    const shared = 'uuid-shared';
    const a = await crearComprobanteService(token1,
        { cuota_id: prestamo.cuotas[4].id, monto: 200, request_id: shared });
    const b = await crearComprobanteService(token2,
        { cuota_id: p2.cuotas[0].id, monto: 300, request_id: shared });
    assert.notEqual(a.id, b.id, 'el mismo request_id en clientes distintos NO debe colisionar');
});

test('notificarClientePorComprobante registra en notificaciones_enviadas al aprobar', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const comp = await crearComprobanteService(token, {
        cuota_id: prestamo.cuotas[0].id, monto: 50, referencia: 'EMAIL-OK',
    });

    await notificarClientePorComprobante({ comprobante: comp, estado: 'aprobado' });

    // Filtrar por el id del comprobante en el mensaje (puede haber otras filas
    // por pruebas anteriores con la misma cuota).
    const { rows } = await pool.query(
        `SELECT * FROM notificaciones_enviadas
         WHERE cliente_id = $1 AND mensaje ILIKE $2`,
        [ctx.cliente_id, `%comprobante #${comp.id}%`]
    );
    assert.ok(rows.length >= 1, 'debe haber al menos una fila registrada para este comprobante');
    assert.match(rows[0].mensaje, /comprobante #/i);
    // Como el SMTP está caído en test (EMAIL_PORT=1), el estado será 'fallido' con error
    assert.equal(rows[0].estado, 'fallido');
    assert.ok(rows[0].error_mensaje, 'debe tener mensaje de error');
});

test('notificarClientePorComprobante registra también al rechazar', async () => {
    const token = await generarTokenPortalService(ctx.cliente_id, ctx.empresa_id);
    const comp = await crearComprobanteService(token, {
        cuota_id: prestamo.cuotas[1].id, monto: 60, referencia: 'EMAIL-FAIL',
    });

    await notificarClientePorComprobante({ comprobante: comp, estado: 'rechazado' });

    const { rows } = await pool.query(
        `SELECT * FROM notificaciones_enviadas
         WHERE cliente_id = $1 AND mensaje ILIKE $2`,
        [ctx.cliente_id, `%comprobante #${comp.id}%`]
    );
    assert.equal(rows.length, 1, 'debe haber exactamente una fila para este comprobante rechazado');
    assert.equal(rows[0].estado, 'fallido');
});

test('notificarClientePorComprobante no hace nada si el cliente no tiene email', async () => {
    // Cliente sin email
    const { rows: cliNoEmail } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido, email)
         VALUES ($1, 'SinMail', 'NoEmail', NULL) RETURNING id`,
        [ctx.empresa_id]
    );
    const pNoEmail = await crearPrestamoService({
        cliente_id: Number(cliNoEmail[0].id), usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id,
        monto: 200, tasa_interes: 0, frecuencia_pago: 'mensual', total_cuotas: 1, fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota',
    });
    const tokenNoEmail = await generarTokenPortalService(Number(cliNoEmail[0].id), ctx.empresa_id);
    const comp = await crearComprobanteService(tokenNoEmail, {
        cuota_id: pNoEmail.cuotas[0].id, monto: 100, referencia: 'NO-MAIL',
    });

    // No debe lanzar y no debe insertar nada en notificaciones_enviadas
    await notificarClientePorComprobante({ comprobante: comp, estado: 'aprobado' });

    const { rows } = await pool.query(
        `SELECT * FROM notificaciones_enviadas WHERE cliente_id = $1`,
        [Number(cliNoEmail[0].id)]
    );
    assert.equal(rows.length, 0, 'no debe haber filas para clientes sin email');
});
