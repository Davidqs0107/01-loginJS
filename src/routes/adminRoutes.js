import { Router } from "express";
import { getEmpresas, updateEmpresaPlan } from "../controllers/adminController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
const { superAdmin } = userRol;

const route = Router();

route.use(validarJWT);
route.get('/', [validarRol(superAdmin)], getEmpresas);
route.put('/', [validarRol(superAdmin)], updateEmpresaPlan);

export default route;