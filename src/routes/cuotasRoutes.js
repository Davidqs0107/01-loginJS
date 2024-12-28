import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { getCuotas, getCuotasByClientId, getCuotasById, getCuotasByPrestamoId, getCuotasByUserId, updateCuota } from "../controllers/cuotasController.js";
const route = Router();
route.use(validarJWT);

route.get('/', getCuotas);
route.get('/:id', getCuotasById);
route.get('/prestamos/:prestamo_id', getCuotasByPrestamoId);
route.get('/usuario/:user_id', getCuotasByUserId);
route.get('/cliente/:cliente_id', getCuotasByClientId);
route.put('/:id', updateCuota);
// route.delete('/:id', deleteUsuario);
export default route;