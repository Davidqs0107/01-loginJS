import { Router } from 'express';
import { validarJWT } from '../middlewares/validar-jwt.js';
import { validarRol } from '../middlewares/validar-rol.js';
import { userRol } from '../constants/usuarios.constants.js';
import {
    getReporteMora,
    getReporteCartera,
    getReporteCobros,
    getReporteAgenda,
    getReporteRecaudacion,
    getReporteFichaCliente,
    getReportePrestamosCliente,
} from '../controllers/reportesController.js';

const { admin, superAdmin, cobrador } = userRol;

const route = Router();
route.use(validarJWT);

// ── Alta Prioridad ───────────────────────────────────────────────────
// GET /api/reportes/mora?page=1&pageSize=50&dias_mora_min=30&cobrador_id=5
route.get('/mora', [validarRol(admin, superAdmin)], getReporteMora);

// GET /api/reportes/cartera
route.get('/cartera', [validarRol(admin, superAdmin)], getReporteCartera);

// GET /api/reportes/cobros?fecha_inicio=2026-03-01&fecha_fin=2026-03-20
route.get('/cobros', [validarRol(admin, superAdmin)], getReporteCobros);

// ── Media Prioridad ──────────────────────────────────────────────────
// GET /api/reportes/agenda?dias=7&cobrador_id=5&page=1&pageSize=50
route.get('/agenda', [validarRol(admin, superAdmin, cobrador)], getReporteAgenda);

// GET /api/reportes/recaudacion?fecha_inicio=2026-01-01&fecha_fin=2026-03-20
route.get('/recaudacion', [validarRol(admin, superAdmin)], getReporteRecaudacion);

// GET /api/reportes/cliente/:clienteId
route.get('/cliente/:clienteId', [validarRol(admin, superAdmin)], getReporteFichaCliente);

// GET /api/reportes/prestamos?searchTerm=juan&estado_prestamo=activo&fecha_inicio=2026-01-01&fecha_fin=2026-03-31
route.get('/prestamos', [validarRol(admin, superAdmin)], getReportePrestamosCliente);

export default route;
