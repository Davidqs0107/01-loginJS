import { Router } from "express";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { crearCliente, getClienteById, getClientes, softDeleteCliente, updateCliente, searchClientes, getScoreCliente, generarTokenPortal, revocarTokenPortal } from "../controllers/clientesController.js";
const route = Router();
route.use(validarJWT);

route.get('/', getClientes);
route.get('/buscar', searchClientes);
route.get('/:id/score', getScoreCliente);
route.post('/:id/portal-token', generarTokenPortal);
route.delete('/:id/portal-token', revocarTokenPortal);
route.get('/:id', getClienteById);
route.post('/', [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('email', 'El email es obligatorio').isEmail(),
    validarCampos
], crearCliente);
route.put('/:id', updateCliente);
// route.delete('/:id', deleteUsuario);
route.delete('/soft/:id', softDeleteCliente);
export default route;