import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import { getAuditoria } from "../controllers/auditoriaController.js";

const { superAdmin, admin } = userRol;
const route = Router();
route.use(validarJWT);

route.get('/', [validarRol(superAdmin, admin)], getAuditoria);

export default route;
