/**
 * Tests de integración: waterfall de mora en pagos + arqueo de caja.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { upsertConfiguracionService } from '../src/services/configuracionService.js';
import { crearPagoService } from '../src/services/pagosServices.js';
import { cerrarArqueoService, getResumenDiaService, resolverArqueoService } from '../src/services/arqueoService.js';

const RUN = `${process.pid}_${Math.floor(process.hrtime()[1])}`;
const empresasCreadas = [];

const seedEmpresa = async (nombre) => {
    const { rows: emp } = await pool.query(`INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`, [`${nombre}_${RUN}`]);
    const empresa_id = Number(emp[0].id);
    empresasCreadas.push(empresa_id);
    const { rows: usr } = await pool.query(
        `INSERT INTO usuarios (empresa_id, rol, nombre, email) VALUES ($1, 'cobrador', 'Cob', $2) RETURNING id`,
        [empresa_id, `cob_${empresa_id}_${RUN}@test.com`]
    );
    const { rows: cli } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, 'Cli', 'X') RETURNING id`, [empresa_id]
    );
    return { empresa_id, usuario_id: Number(usr[0].id), cliente_id: Number(cli[0].id) };
};

/** Crea un préstamo con una cuota que vence hace `diasAtraso` días. */
const seedCuotaVencida = async (ctx, { montoCuota, diasAtraso }) => {
    const { rows: pr } = await pool.query(
        `INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio)
         VALUES ($1, $2, $3, $4, 10, 'mensual', 1, CURRENT_DATE) RETURNING id`,
        [ctx.cliente_id, ctx.usuario_id, ctx.empresa_id, montoCuota]
    );
    const prestamo_id = Number(pr[0].id);
    const { rows: cu } = await pool.query(
        `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto)
         VALUES ($1, 1, CURRENT_DATE - ($2)::int, $3) RETURNING id`,
        [prestamo_id, diasAtraso, montoCuota]
    );
    return { prestamo_id, cuota_id: Number(cu[0].id) };
};

const getCuota = async (id) => (await pool.query(`SELECT * FROM cuotas WHERE id = $1`, [id])).rows[0];
const getPago = async (id) => (await pool.query(`SELECT * FROM pagos WHERE id = $1`, [id])).rows[0];

let empMora, empSinMora;

before(async () => {
    empMora = await seedEmpresa('ConMora');
    // Mora fija: 10 por día de atraso, sin gracia
    await upsertConfiguracionService(empMora.empresa_id, {
        mora_activa: true, mora_tipo: 'monto_fijo_dia', mora_valor: 10, mora_dias_gracia: 0,
    });
    empSinMora = await seedEmpresa('SinMora'); // mora_activa por defecto = false
});

after(async () => {
    for (const empresa_id of empresasCreadas) {
        await pool.query(`DELETE FROM arqueos WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(
            `DELETE FROM pagos WHERE cuota_id IN (SELECT cu.id FROM cuotas cu JOIN prestamos p ON cu.prestamo_id=p.id WHERE p.empresa_id=$1)`,
            [empresa_id]
        );
        await pool.query(`DELETE FROM cuotas WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id=$1)`, [empresa_id]);
        await pool.query(`DELETE FROM prestamos WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM clientes WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM usuarios WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM configuracion_empresa WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    await pool.end();
});

// ─────────────────────────────────────────────
// Waterfall de mora
// ─────────────────────────────────────────────
test('con mora activa: el pago cubre primero la mora y el resto la cuota', async () => {
    // Cuota 200, vencida hace 5 días => mora = 50
    const { cuota_id } = await seedCuotaVencida(empMora, { montoCuota: 200, diasAtraso: 5 });
    const res = await crearPagoService({
        cuota_id, usuario_id: empMora.usuario_id, empresa_id: empMora.empresa_id, monto: 100, fecha_pago: '2026-07-01', tipo_pago: 'efectivo',
    });
    assert.equal(res.moraAplicada, 50);
    assert.equal(res.montoAplicado, 50);

    const pago = await getPago(res.pagoId);
    assert.equal(parseFloat(pago.monto_mora), 50);
    assert.equal(parseFloat(pago.monto), 50);

    const cuota = await getCuota(cuota_id);
    assert.equal(parseFloat(cuota.monto_pagado), 50); // solo el saldo de cuota, no la mora
    assert.equal(cuota.estado, 'parcial');
});

test('sin mora activa: comportamiento histórico (todo a la cuota, monto_mora = 0)', async () => {
    const { cuota_id } = await seedCuotaVencida(empSinMora, { montoCuota: 200, diasAtraso: 5 });
    const res = await crearPagoService({
        cuota_id, usuario_id: empSinMora.usuario_id, empresa_id: empSinMora.empresa_id, monto: 100, fecha_pago: '2026-07-01', tipo_pago: 'efectivo',
    });
    assert.equal(res.moraAplicada, 0);
    assert.equal(res.montoAplicado, 100);

    const pago = await getPago(res.pagoId);
    assert.equal(parseFloat(pago.monto_mora), 0);
    assert.equal(parseFloat(pago.monto), 100);
});

// ─────────────────────────────────────────────
// Arqueo de caja
// ─────────────────────────────────────────────
test('cerrar arqueo: calcula lo cobrado (monto + mora) y la diferencia con lo entregado', async () => {
    const ctx = await seedEmpresa('Arqueo');
    const hoy = new Date().toISOString().slice(0, 10);

    // Dos cuotas, pagadas hoy por el cobrador (sin mora en esta empresa) => cobrado = 100 + 70
    const c1 = await seedCuotaVencida(ctx, { montoCuota: 100, diasAtraso: 1 });
    const c2 = await seedCuotaVencida(ctx, { montoCuota: 70, diasAtraso: 1 });
    await crearPagoService({ cuota_id: c1.cuota_id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id, monto: 100, fecha_pago: hoy, tipo_pago: 'efectivo' });
    await crearPagoService({ cuota_id: c2.cuota_id, usuario_id: ctx.usuario_id, empresa_id: ctx.empresa_id, monto: 70, fecha_pago: hoy, tipo_pago: 'efectivo' });

    // Preview
    const resumen = await getResumenDiaService({ empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id, fecha: hoy });
    assert.equal(resumen.total_cobrado_sistema, 170);
    assert.equal(resumen.num_pagos, 2);

    // El cobrador declara haber entregado 150 (faltan 20)
    const arqueo = await cerrarArqueoService({ empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id, fecha: hoy, total_entregado: 150 });
    assert.equal(parseFloat(arqueo.total_cobrado_sistema), 170);
    assert.equal(parseFloat(arqueo.total_entregado), 150);
    assert.equal(parseFloat(arqueo.diferencia), -20); // faltante
    assert.equal(arqueo.estado, 'cerrado');

    // Admin aprueba
    const aprobado = await resolverArqueoService({ id: arqueo.id, empresa_id: ctx.empresa_id, estado: 'aprobado', aprobado_por: ctx.usuario_id });
    assert.equal(aprobado.estado, 'aprobado');

    // No se puede re-cerrar un arqueo aprobado
    await assert.rejects(
        () => cerrarArqueoService({ empresa_id: ctx.empresa_id, usuario_id: ctx.usuario_id, fecha: hoy, total_entregado: 170 }),
        /aprobado/i
    );
});
