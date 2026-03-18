/**
 * Template de ruta protegida — Sistema de Gestión de Préstamos
 * 
 * Copia este archivo y reemplaza:
 *   - MODULE_NAME     → nombre del módulo (ej: reportes)
 *   - getAll          → nombre del controlador de listado
 *   - getById         → nombre del controlador de detalle
 *   - crear           → nombre del controlador de creación
 *   - actualizar      → nombre del controlador de edición
 *   - eliminar        → nombre del controlador de eliminación
 */

import { Router } from 'express';
import { check } from 'express-validator';

import { validarJWT } from '../middlewares/validar-jwt.js';
import { validarRol } from '../middlewares/validar-rol.js';
import { validarCampos } from '../middlewares/validar-campos.js';
import { userRol } from '../constants/usuarios.constants.js';

// Importar controladores del módulo
import {
    getAll,
    getById,
    crear,
    actualizar,
    eliminar
} from '../controllers/MODULE_NAMEController.js';

const route = Router();

// GET /api/MODULE_NAME — Listar todos (cualquier rol autenticado)
route.get('/', [
    validarJWT
], getAll);

// GET /api/MODULE_NAME/:id — Obtener por ID
route.get('/:id', [
    validarJWT,
    check('id', 'El id debe ser un número válido').isInt({ min: 1 }),
    validarCampos
], getById);

// POST /api/MODULE_NAME — Crear (admin y cobrador)
route.post('/', [
    validarJWT,
    validarRol(userRol.admin, userRol.cobrador),
    // Agregar validaciones de campos aquí:
    check('campo_requerido', 'El campo es requerido').not().isEmpty(),
    validarCampos
], crear);

// PUT /api/MODULE_NAME/:id — Actualizar (solo admin)
route.put('/:id', [
    validarJWT,
    validarRol(userRol.admin),
    check('id', 'El id debe ser un número válido').isInt({ min: 1 }),
    validarCampos
], actualizar);

// DELETE /api/MODULE_NAME/:id — Eliminar/Desactivar (solo admin)
route.delete('/:id', [
    validarJWT,
    validarRol(userRol.admin),
    check('id', 'El id debe ser un número válido').isInt({ min: 1 }),
    validarCampos
], eliminar);

export default route;


// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE DE CONTROLADOR — src/controllers/MODULE_NAMEController.js
// ─────────────────────────────────────────────────────────────────────────────

/*
export const getAll = async (req, res) => {
  const { empresa_id } = req; // Siempre del token JWT
  try {
    const data = await getAllService(empresa_id);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error('Error en getAll:', error);
    return res.status(500).json({ ok: false, msg: 'Error al obtener datos' });
  }
};

export const getById = async (req, res) => {
  const { empresa_id } = req;
  const { id } = req.params;
  try {
    const data = await getByIdService(id, empresa_id);
    if (!data) return res.status(404).json({ ok: false, msg: 'No encontrado' });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error('Error en getById:', error);
    return res.status(500).json({ ok: false, msg: 'Error al obtener dato' });
  }
};

export const crear = async (req, res) => {
  const { empresa_id, id: usuario_id } = req;
  const body = req.body;
  try {
    const data = await crearService({ ...body, empresa_id, usuario_id });
    return res.status(201).json({ ok: true, msg: 'Creado con éxito', data });
  } catch (error) {
    console.error('Error en crear:', error);
    return res.status(500).json({ ok: false, msg: 'Error al crear' });
  }
};
*/
