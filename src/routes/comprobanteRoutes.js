import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import { getComprobantes, validarComprobante } from "../controllers/comprobanteController.js";

const { superAdmin, admin, cobrador } = userRol;
const route = Router();
route.use(validarJWT);

route.get('/', getComprobantes);
route.put('/:id/validar', [validarRol(superAdmin, admin, cobrador)], validarComprobante);

export default route;
