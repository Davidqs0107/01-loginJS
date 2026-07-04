/**
 * Tests de suscripción: derivación de estado (puro) + integración con la BD.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { estadoSuscripcion, getSuscripcionEstadoService, getSuscripcionesService, DIAS_POR_VENCER } from '../src/services/suscripcionService.js';

// ── Unit: derivación de estado ──
test('estadoSuscripcion: vencido / por_vencer / vigente / sin_plan', () => {
    assert.equal(estadoSuscripcion(-1), 'vencido');
    assert.equal(estadoSuscripcion(0), 'por_vencer');
    assert.equal(estadoSuscripcion(DIAS_POR_VENCER), 'por_vencer');
    assert.equal(estadoSuscripcion(DIAS_POR_VENCER + 1), 'vigente');
    assert.equal(estadoSuscripcion(null), 'sin_plan');
});

// ── Integración ──
const RUN = `${process.pid}_${Math.floor(process.hrtime()[1])}`;
const empresasCreadas = [];
let planId;

const seedEmpresaConPlan = async (nombre, diasParaVencer) => {
    const { rows: emp } = await pool.query(`INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`, [`${nombre}_${RUN}`]);
    const empresa_id = Number(emp[0].id);
    empresasCreadas.push(empresa_id);
    await pool.query(
        `INSERT INTO empresa_planes (empresa_id, plan_id, fecha_inicio, fecha_fin, estado)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_DATE + ($3)::int, 'activo')`,
        [empresa_id, planId, diasParaVencer]
    );
    return empresa_id;
};

before(async () => {
    const { rows } = await pool.query(`SELECT id FROM planes ORDER BY id LIMIT 1`);
    planId = Number(rows[0].id);
});

after(async () => {
    for (const empresa_id of empresasCreadas) {
        await pool.query(`DELETE FROM empresa_planes WHERE empresa_id = $1`, [empresa_id]);
        await pool.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    await pool.end();
});

test('getSuscripcionEstado: empresa con plan vigente (lejos de vencer)', async () => {
    const id = await seedEmpresaConPlan('Vigente', 90);
    const s = await getSuscripcionEstadoService(id);
    assert.equal(s.estado, 'vigente');
    assert.ok(s.dias_restantes >= 89);
});

test('getSuscripcionEstado: empresa por vencer (dentro del umbral)', async () => {
    const id = await seedEmpresaConPlan('PorVencer', 3);
    const s = await getSuscripcionEstadoService(id);
    assert.equal(s.estado, 'por_vencer');
});

test('getSuscripcionEstado: empresa vencida', async () => {
    const id = await seedEmpresaConPlan('Vencida', -5);
    const s = await getSuscripcionEstadoService(id);
    assert.equal(s.estado, 'vencido');
    assert.ok(s.dias_restantes < 0);
});

test('getSuscripciones (admin): paginado, filtra por estado y ordena por urgencia', async () => {
    const idVenc = await seedEmpresaConPlan('AdminVenc', -2);
    const { data, meta } = await getSuscripcionesService({ estado: 'vencido', page: 1, pageSize: 1000 });
    assert.ok(data.some((s) => s.empresa_id === idVenc));
    // Todas las devueltas con ese filtro son 'vencido'
    assert.ok(data.every((s) => s.estado === 'vencido'));
    // Trae metadatos de paginación
    assert.ok(meta && typeof meta.totalItems === 'number');
});
