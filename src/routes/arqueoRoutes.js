import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import { cerrarArqueo, getArqueos, getResumenDia, resolverArqueo } from "../controllers/arqueoController.js";

const { superAdmin, admin } = userRol;
const route = Router();
route.use(validarJWT);

route.get('/', getArqueos);                 // admin: todos; cobrador: los suyos
route.get('/resumen', getResumenDia);       // preview del día antes de cerrar
route.post('/', cerrarArqueo);              // el cobrador cierra su caja
route.put('/:id/resolver', [validarRol(superAdmin, admin)], resolverArqueo); // admin aprueba/rechaza

export default route;
