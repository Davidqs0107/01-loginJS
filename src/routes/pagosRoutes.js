import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { crearPago, eliminarPago, getPagosbyCuotaId, getPagosById, getPagosbyUserId } from "../controllers/pagosController.js";
const route = Router();
route.use(validarJWT);

route.get('/user/:user_id', getPagosbyUserId);
route.get('/cuota/:cuota_id', getPagosbyCuotaId);
route.get('/:id', getPagosById);
route.post('/', [
    check('cuota_id', 'El campo cuota_id es obligatorio').not().isEmpty(),
    check('monto', 'El campo monto es obligatorio').not().isEmpty(),
    check('fecha_pago', 'El campo fecha_pago es obligatorio').not().isEmpty(),
    validarCampos
], crearPago);
// route.put('/:id', updateCliente);
route.delete('/:id', eliminarPago);
// route.delete('/soft/:id', softDeleteCliente);
export default route;