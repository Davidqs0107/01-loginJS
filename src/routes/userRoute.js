import { Router } from "express";
import { createUsuario, deleteUsuario, getById, getUsuarios, softDeleteUsuario, update } from "../controllers/userController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarCampos } from "../middlewares/validar-campos.js";
import { check } from "express-validator";
const route = Router();
route.use(validarJWT);

route.get('/', getUsuarios);
route.get('/:id', getById);
route.post('/', [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'El password es obligatorio').not().isEmpty(),
    validarCampos
], createUsuario);
route.put('/:id', update);
route.delete('/:id', deleteUsuario);
route.delete('/soft/:id', softDeleteUsuario);
export default route;