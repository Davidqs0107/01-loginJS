/**
 * Tests de integración de las nuevas features contra la base de datos real:
 *  - Configuración por empresa (get/upsert)
 *  - Incumplimiento automático
 *  - Score / semáforo de cliente
 *  - Auditoría al eliminar un pago
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { getConfiguracionService, upsertConfiguracionService } from '../src/services/configuracionService.js';
import { marcarPrestamosIncumplidosService } from '../src/services/incumplimientoService.js';
import { getScoreClienteService } from '../src/services/scoreService.js';
import { crearPagoService, eliminarPagoService } from '../src/services/pagosServices.js';

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
    return { empresa_id, usuario_id: Number(usr[0].id) };
};

const seedCliente = async (empresa_id, nombre) => {
    const { rows } = await pool.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido) VALUES ($1, $2, 'X') RETURNING id`,
        [empresa_id, nombre]
    );
    return Number(rows[0].id);
};

/**
 * Crea un préstamo con cuotas. `diasVencimiento` es un array: por cada cuota,
 * cuántos días respecto a HOY vence (negativo = ya vencida).
 */
const seedPrestamo = async ({ empresa_id, usuario_id, cliente_id, montoCuota, diasVencimiento, estadoPrestamo = 'activo' }) => {
    const { rows: pr } = await pool.query(
        `INSERT INTO prestamos (cliente_id, usuario_id, empresa_id, monto, tasa_interes, frecuencia_pago, total_cuotas, fecha_inicio, estado_prestamo)
         VALUES ($1, $2, $3, $4, 10, 'mensual', $5, CURRENT_DATE, $6) RETURNING id`,
        [cliente_id, usuario_id, empresa_id, montoCuota * diasVencimiento.length, diasVencimiento.length, estadoPrestamo]
    );
    const prestamo_id = Number(pr[0].id);
    const cuotaIds = [];
    for (let i = 0; i < diasVencimiento.length; i++) {
        const { rows } = await pool.query(
            `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_pago, monto)
             VALUES ($1, $2, CURRENT_DATE + ($3)::int, $4) RETURNING id`,
            [prestamo_id, i + 1, diasVencimiento[i], montoCuota]
        );
        cuotaIds.push(Number(rows[0].id));
    }
    return { prestamo_id, cuotaIds };
};

const getEstadoPrestamo = async (id) =>
    (await pool.query(`SELECT estado_prestamo FROM prestamos WHERE id = $1`, [id])).rows[0].estado_prestamo;

let emp;

before(async () => {
    emp = await seedEmpresa('Feat');
});

after(async () => {
    for (const empresa_id of empresasCreadas) {
        await pool.query(`DELETE FROM auditoria WHERE empresa_id = $1`, [empresa_id]);
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
// Configuración por empresa
// ─────────────────────────────────────────────
test('getConfiguracion devuelve defaults si la empresa no configuró nada', async () => {
    const otra = await seedEmpresa('SinConfig');
    const config = await getConfiguracionService(otra.empresa_id);
    assert.equal(config.mora_activa, false);
    assert.equal(config.incumplido_dias, 90);
    assert.equal(config.moneda, 'BOB');
});

test('upsertConfiguracion crea y luego actualiza (idempotente por empresa)', async () => {
    await upsertConfiguracionService(emp.empresa_id, {
        mora_activa: true, mora_tipo: 'monto_fijo_dia', mora_valor: 15, incumplido_dias: 30,
    });
    let config = await getConfiguracionService(emp.empresa_id);
    assert.equal(config.mora_activa, true);
    assert.equal(config.incumplido_dias, 30);

    // Segundo upsert: actualiza, no duplica
    await upsertConfiguracionService(emp.empresa_id, { mora_activa: false, incumplido_dias: 45 });
    config = await getConfiguracionService(emp.empresa_id);
    assert.equal(config.mora_activa, false);
    assert.equal(config.incumplido_dias, 45);

    const { rows } = await pool.query(`SELECT COUNT(*) FROM configuracion_empresa WHERE empresa_id=$1`, [emp.empresa_id]);
    assert.equal(parseInt(rows[0].count, 10), 1);
});

// ─────────────────────────────────────────────
// Incumplimiento automático
// ─────────────────────────────────────────────
test('marca incumplido los préstamos cuyo atraso supera el umbral de la empresa', async () => {
    await upsertConfiguracionService(emp.empresa_id, { incumplido_dias: 90 });
    const cliente = await seedCliente(emp.empresa_id, 'Deudor');

    // Préstamo con cuota vencida hace 100 días -> debe incumplir
    const grave = await seedPrestamo({ empresa_id: emp.empresa_id, usuario_id: emp.usuario_id, cliente_id: cliente, montoCuota: 100, diasVencimiento: [-100, 30] });
    // Préstamo con cuota vencida hace 10 días -> NO debe incumplir
    const leve = await seedPrestamo({ empresa_id: emp.empresa_id, usuario_id: emp.usuario_id, cliente_id: cliente, montoCuota: 100, diasVencimiento: [-10, 30] });

    const res = await marcarPrestamosIncumplidosService(emp.empresa_id);
    assert.ok(res.ids.includes(grave.prestamo_id));
    assert.ok(!res.ids.includes(leve.prestamo_id));

    assert.equal(await getEstadoPrestamo(grave.prestamo_id), 'incumplido');
    assert.equal(await getEstadoPrestamo(leve.prestamo_id), 'activo');
});

// ─────────────────────────────────────────────
// Score / semáforo del cliente
// ─────────────────────────────────────────────
test('score: cliente sin préstamos -> sin_historial', async () => {
    const cliente = await seedCliente(emp.empresa_id, 'Nuevo');
    const score = await getScoreClienteService(cliente, emp.empresa_id);
    assert.equal(score.semaforo, 'sin_historial');
});

test('score: cliente con préstamo al día -> verde', async () => {
    const cliente = await seedCliente(emp.empresa_id, 'BuenPagador');
    // Cuotas futuras (no vencidas)
    await seedPrestamo({ empresa_id: emp.empresa_id, usuario_id: emp.usuario_id, cliente_id: cliente, montoCuota: 100, diasVencimiento: [15, 45] });
    const score = await getScoreClienteService(cliente, emp.empresa_id);
    assert.equal(score.semaforo, 'verde');
    assert.equal(score.metricas.cuotas_vencidas, 0);
});

test('score: cliente con mora >= 30 días -> rojo', async () => {
    const cliente = await seedCliente(emp.empresa_id, 'Moroso');
    await seedPrestamo({ empresa_id: emp.empresa_id, usuario_id: emp.usuario_id, cliente_id: cliente, montoCuota: 100, diasVencimiento: [-40, 20] });
    const score = await getScoreClienteService(cliente, emp.empresa_id);
    assert.equal(score.semaforo, 'rojo');
    assert.ok(score.metricas.max_dias_atraso >= 30);
});

// ─────────────────────────────────────────────
// Auditoría al eliminar pago
// ─────────────────────────────────────────────
test('eliminar un pago deja registro en la bitácora de auditoría', async () => {
    const cliente = await seedCliente(emp.empresa_id, 'Cli');
    const { cuotaIds } = await seedPrestamo({ empresa_id: emp.empresa_id, usuario_id: emp.usuario_id, cliente_id: cliente, montoCuota: 100, diasVencimiento: [5] });
    const { pagoId } = await crearPagoService({
        cuota_id: cuotaIds[0], usuario_id: emp.usuario_id, empresa_id: emp.empresa_id, monto: 100, fecha_pago: '2026-07-01', tipo_pago: 'efectivo',
    });

    await eliminarPagoService(pagoId, emp.empresa_id, { usuario_id: emp.usuario_id, ip: '127.0.0.1' });

    const { rows } = await pool.query(
        `SELECT accion, entidad, entidad_id, usuario_id, datos_antes FROM auditoria
         WHERE empresa_id = $1 AND accion = 'eliminar_pago' AND entidad_id = $2`,
        [emp.empresa_id, pagoId]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entidad, 'pago');
    assert.equal(Number(rows[0].usuario_id), emp.usuario_id);
    assert.ok(rows[0].datos_antes); // snapshot del pago borrado
});
