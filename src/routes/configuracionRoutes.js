import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import { getConfiguracion, updateConfiguracion } from "../controllers/configuracionController.js";

const { superAdmin, admin } = userRol;
const route = Router();
route.use(validarJWT);

route.get('/', getConfiguracion);
route.put('/', [validarRol(superAdmin, admin)], updateConfiguracion);

export default route;
