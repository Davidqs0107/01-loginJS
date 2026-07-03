/**
 * Seed de desarrollo para hatria.
 *
 * Crea:
 *  1) Un usuario SUPER_ADMIN con su propia empresa "plataforma" (para gestionar
 *     empresas/planes y crear más administradores desde /api/admin).
 *  2) Un usuario ADMIN con una empresa "Financiera Ejemplo", un cobrador,
 *     clientes y préstamos/pagos de muestra para ver el sistema en funcionamiento.
 *
 * Es idempotente: en cada ejecución borra sus propios datos (por nombre de empresa
 * y emails marcadores) y los vuelve a crear. NO toca datos ajenos al seed.
 *
 * Uso:  npm run seed
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';
import { crearPrestamoService } from '../src/services/prestamosServices.js';
import { crearPagoService } from '../src/services/pagosServices.js';

// ── Marcadores del seed (para poder limpiar sin tocar datos reales) ──
const SUPERADMIN_EMAIL = 'superadmin@hatria.com';
const ADMIN_EMAIL = 'admin@hatria.com';
const COBRADOR_EMAIL = 'cobrador@hatria.com';
const EMPRESA_PLATAFORMA = 'Plataforma Hatria (seed)';
const EMPRESA_FINANCIERA = 'Financiera Ejemplo (seed)';

const PASSWORDS = {
    [SUPERADMIN_EMAIL]: 'super123',
    [ADMIN_EMAIL]: 'admin123',
    [COBRADOR_EMAIL]: 'cobra123',
};

const hash = (pw) => bcrypt.hashSync(pw, 10);
const enDias = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d;
};

/** Garantiza que exista al menos un plan y devuelve su id. */
const asegurarPlan = async (client) => {
    const { rows } = await client.query('SELECT id FROM planes ORDER BY id LIMIT 1');
    if (rows.length > 0) return Number(rows[0].id);
    const insert = await client.query(
        `INSERT INTO planes (nombre, duracion_dias, precio) VALUES ('pro', 30, 50) RETURNING id`
    );
    return Number(insert.rows[0].id);
};

/** Borra los datos previos del seed (idempotencia), respetando las FKs. */
const limpiarSeed = async (client) => {
    const { rows } = await client.query(
        `SELECT id FROM empresas WHERE nombre = ANY($1)
         UNION
         SELECT empresa_id AS id FROM usuarios WHERE email = ANY($2)`,
        [[EMPRESA_PLATAFORMA, EMPRESA_FINANCIERA], [SUPERADMIN_EMAIL, ADMIN_EMAIL, COBRADOR_EMAIL]]
    );
    const ids = rows.map((r) => Number(r.id));
    for (const empresa_id of ids) {
        await client.query(
            `DELETE FROM pagos WHERE cuota_id IN (
                SELECT cu.id FROM cuotas cu JOIN prestamos p ON cu.prestamo_id = p.id WHERE p.empresa_id = $1)`,
            [empresa_id]
        );
        await client.query(
            `DELETE FROM prestamo_archivos WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id = $1)`,
            [empresa_id]
        );
        await client.query(
            `DELETE FROM cuotas WHERE prestamo_id IN (SELECT id FROM prestamos WHERE empresa_id = $1)`,
            [empresa_id]
        );
        await client.query(`DELETE FROM prestamos WHERE empresa_id = $1`, [empresa_id]);
        await client.query(`DELETE FROM descargos WHERE empresa_id = $1`, [empresa_id]);
        await client.query(`DELETE FROM clientes WHERE empresa_id = $1`, [empresa_id]);
        await client.query(`DELETE FROM usuarios WHERE empresa_id = $1`, [empresa_id]);
        await client.query(`DELETE FROM empresa_planes WHERE empresa_id = $1`, [empresa_id]);
        await client.query(`DELETE FROM empresas WHERE id = $1`, [empresa_id]);
    }
    return ids.length;
};

/** Crea una empresa + su plan vigente (larga duración) y devuelve el empresa_id. */
const crearEmpresaConPlan = async (client, nombre, planId) => {
    const { rows } = await client.query(`INSERT INTO empresas (nombre) VALUES ($1) RETURNING id`, [nombre]);
    const empresa_id = Number(rows[0].id);
    await client.query(
        `INSERT INTO empresa_planes (empresa_id, plan_id, fecha_inicio, fecha_fin, estado)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'activo')`,
        [empresa_id, planId, enDias(3650)] // ~10 años, para que no expire en desarrollo
    );
    return empresa_id;
};

const crearUsuario = async (client, { empresa_id, rol, nombre, apellido, email }) => {
    const { rows } = await client.query(
        `INSERT INTO usuarios (empresa_id, rol, nombre, apellido, email, password)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [empresa_id, rol, nombre, apellido, email, hash(PASSWORDS[email])]
    );
    return Number(rows[0].id);
};

const crearCliente = async (client, { empresa_id, nombre, apellido, telefono, email }) => {
    const { rows } = await client.query(
        `INSERT INTO clientes (empresa_id, nombre, apellido, telefono, email)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [empresa_id, nombre, apellido, telefono, email]
    );
    return Number(rows[0].id);
};

const main = async () => {
    // Fase 1: preparación en una transacción (planes, limpieza, empresas/usuarios/clientes)
    const setup = await pool.connect();
    let ctx;
    try {
        await setup.query('BEGIN');

        const planId = await asegurarPlan(setup);
        const borradas = await limpiarSeed(setup);
        if (borradas > 0) console.log(`🧹 Limpieza de seed previo: ${borradas} empresa(s) eliminada(s).`);

        // 1) Super admin + su empresa "plataforma"
        const empresaPlataforma = await crearEmpresaConPlan(setup, EMPRESA_PLATAFORMA, planId);
        const superAdminId = await crearUsuario(setup, {
            empresa_id: empresaPlataforma, rol: 'super_admin',
            nombre: 'Super', apellido: 'Admin', email: SUPERADMIN_EMAIL,
        });

        // 2) Admin + su empresa "Financiera Ejemplo" + un cobrador
        const empresaFinanciera = await crearEmpresaConPlan(setup, EMPRESA_FINANCIERA, planId);
        const adminId = await crearUsuario(setup, {
            empresa_id: empresaFinanciera, rol: 'admin',
            nombre: 'Ana', apellido: 'Gerente', email: ADMIN_EMAIL,
        });
        const cobradorId = await crearUsuario(setup, {
            empresa_id: empresaFinanciera, rol: 'cobrador',
            nombre: 'Carlos', apellido: 'Cobrador', email: COBRADOR_EMAIL,
        });

        // Clientes de la financiera
        const clienteJuan = await crearCliente(setup, {
            empresa_id: empresaFinanciera, nombre: 'Juan', apellido: 'Pérez', telefono: '70000001', email: 'juan@ejemplo.com',
        });
        const clienteMaria = await crearCliente(setup, {
            empresa_id: empresaFinanciera, nombre: 'María', apellido: 'López', telefono: '70000002', email: 'maria@ejemplo.com',
        });

        await setup.query('COMMIT');
        ctx = { empresaPlataforma, superAdminId, empresaFinanciera, adminId, cobradorId, clienteJuan, clienteMaria };
    } catch (error) {
        await setup.query('ROLLBACK');
        throw error;
    } finally {
        setup.release();
    }

    // Fase 2: préstamos y pagos usando los SERVICIOS reales (cada uno con su propia transacción)
    const { empresaFinanciera, cobradorId, clienteJuan, clienteMaria } = ctx;

    // Préstamo 1: Capital + Interés, mensual, con historial de pagos
    const p1 = await crearPrestamoService({
        cliente_id: clienteJuan, usuario_id: cobradorId, empresa_id: empresaFinanciera,
        monto: 5000, tasa_interes: 20, frecuencia_pago: 'mensual', total_cuotas: 6,
        fecha_inicio: '2026-05-01', tipo_prestamo: 'cuota', documento: null,
    });
    // Pagar la 1ª cuota completa y la 2ª parcial (deja el préstamo "activo" con algo de mora)
    await crearPagoService({
        cuota_id: p1.cuotas[0].id, usuario_id: cobradorId, empresa_id: empresaFinanciera,
        monto: Number(p1.cuotas[0].monto), fecha_pago: '2026-06-01', tipo_pago: 'efectivo',
    });
    await crearPagoService({
        cuota_id: p1.cuotas[1].id, usuario_id: cobradorId, empresa_id: empresaFinanciera,
        monto: Math.round(Number(p1.cuotas[1].monto) / 2), fecha_pago: '2026-07-01', tipo_pago: 'qr',
    });

    // Préstamo 2: Interés Fijo, quincenal, sin pagos (para ver un préstamo nuevo)
    const p2 = await crearPrestamoService({
        cliente_id: clienteMaria, usuario_id: cobradorId, empresa_id: empresaFinanciera,
        monto: 8000, tasa_interes: 10, frecuencia_pago: 'quincenal', total_cuotas: 4,
        fecha_inicio: '2026-06-15', tipo_prestamo: 'fijo', documento: null,
    });

    // Resumen
    console.log('\n✅ Seed completado.\n');
    console.log('┌─ Credenciales de acceso ────────────────────────────────');
    console.log(`│ SUPER ADMIN  →  ${SUPERADMIN_EMAIL}   /  ${PASSWORDS[SUPERADMIN_EMAIL]}`);
    console.log(`│   empresa "plataforma" id=${ctx.empresaPlataforma} · gestiona empresas y planes (/admin)`);
    console.log(`│ ADMIN        →  ${ADMIN_EMAIL}        /  ${PASSWORDS[ADMIN_EMAIL]}`);
    console.log(`│   empresa "${EMPRESA_FINANCIERA}" id=${empresaFinanciera}`);
    console.log(`│ COBRADOR     →  ${COBRADOR_EMAIL}     /  ${PASSWORDS[COBRADOR_EMAIL]}`);
    console.log('├─ Datos de muestra en la financiera ─────────────────────');
    console.log(`│ Clientes: Juan Pérez (id=${clienteJuan}), María López (id=${clienteMaria})`);
    console.log(`│ Préstamo 1 (Capital+Interés) id=${p1.prestamo[0].id}: 1 cuota pagada, 1 parcial`);
    console.log(`│ Préstamo 2 (Interés Fijo)   id=${p2.prestamo[0].id}: sin pagos`);
    console.log('└─────────────────────────────────────────────────────────');
};

main()
    .then(() => pool.end())
    .catch(async (error) => {
        console.error('❌ Error en el seed:', error);
        await pool.end();
        process.exit(1);
    });
