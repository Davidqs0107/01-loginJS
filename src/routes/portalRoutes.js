import { Router } from "express";
import { getPortalResumen, subirComprobante } from "../controllers/portalController.js";

// Rutas PÚBLICAS: acceso por token del cliente, sin login de staff (sin validarJWT).
const route = Router();

route.get('/:token', getPortalResumen);
route.post('/:token/comprobante', subirComprobante);

export default route;
