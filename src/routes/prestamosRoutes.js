import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { crearPrestamo, deleteFile, getPrestamos, getPrestamosByClientId, getPrestamosById, getPrestamosByUserId, getUploadFile, updatePrestamo, uploadFile } from "../controllers/prestamosController.js";
const route = Router();
route.use(validarJWT);

route.get('/', getPrestamos);
route.get('/:id', getPrestamosById);
route.get('/user/:userId', getPrestamosByUserId);
route.get('/client/:clientId', getPrestamosByClientId);
route.post('/', [
    check('cliente_id', 'El campo cliente_id es obligatorio').not().isEmpty(),
    check('tipo_prestamo', 'El campo tipo_prestamo es obligatorio').not().isEmpty(),
    check('monto', 'El campo monto es obligatorio').not().isEmpty(),
    check('tasa_interes', 'El campo tasa_interes es obligatorio').not().isEmpty(),
    check('frecuencia_pago', 'El campo frecuencia_pago es obligatorio').not().isEmpty(),
    check('total_cuotas', 'El campo total_cuotas es obligatorio').not().isEmpty(),
    check('fecha_inicio', 'El campo fecha_inicio es obligatorio').not().isEmpty(),
    validarCampos
], crearPrestamo);
route.put('/:id', [
    check('documento', 'El campo documento es obligatorio').not().isEmpty(),
    validarCampos
], updatePrestamo);

route.post('/:id/archivos', [

], uploadFile);

route.get('/:id/archivos', getUploadFile);
route.delete('/:id/archivos/:archivoId', deleteFile);
// // route.delete('/:id', deleteUsuario);
// route.delete('/soft/:id', softDeleteCliente);
export default route;