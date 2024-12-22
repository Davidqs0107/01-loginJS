import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { crearPrestamo, getPrestamos, getPrestamosByClientId, getPrestamosById, getPrestamosByUserId } from "../controllers/prestamosController.js";
const route = Router();
route.use(validarJWT);

route.get('/', getPrestamos);
route.get('/:id', getPrestamosById);
route.get('/user/:userId', getPrestamosByUserId);
route.get('/client/:clientId', getPrestamosByClientId);
route.post('/', [
    check('cliente_id', 'El campo cliente_id es obligatorio').not().isEmpty(),
    check('usuario_id', 'El campo apellido es obligatorio').not().isEmpty(),
    check('empresa_id', 'El campo empresa_id es obligatorio').not().isEmpty(),
    check('monto', 'El campo monto es obligatorio').not().isEmpty(),
    check('tasa_interes', 'El campo tasa_interes es obligatorio').not().isEmpty(),
    check('frecuencia_pago', 'El campo frecuencia_pago es obligatorio').not().isEmpty(),
    check('total_cuotas', 'El campo total_cuotas es obligatorio').not().isEmpty(),
    check('fecha_inicio', 'El campo fecha_inicio es obligatorio').not().isEmpty(),
    validarCampos
], crearPrestamo);
// route.put('/:id', updateCliente);
// // route.delete('/:id', deleteUsuario);
// route.delete('/soft/:id', softDeleteCliente);
export default route;