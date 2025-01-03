import { Router } from "express";
import { createUsuario, deleteUsuario, getById, getUsuarios, softDeleteUsuario, update, updateCobrador } from "../controllers/userController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
const { superAdmin, admin, cobrador } = userRol;
const route = Router();
route.use(validarJWT);

route.get('/', getUsuarios);
route.get('/:id', getById);
route.post('/', [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validarCampos,
    validarRol(superAdmin, admin)
], createUsuario);
route.put('/:id', [
    validarRol(superAdmin, admin)
], update);
route.put('/cobrador/:id', [

], updateCobrador);
route.delete('/:id', [validarRol(superAdmin, admin)], deleteUsuario);
route.delete('/soft/:id', [validarRol(superAdmin, admin)], softDeleteUsuario);
export default route;