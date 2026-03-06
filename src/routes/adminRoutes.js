/*
/api/admin
*/
import { Router } from "express";
import { getEmpresaByName, getEmpresas, getPlanes, getUsuariosByEmpresa, limpiarDatosEmpresa, updateEmpresaPlan } from "../controllers/adminController.js";
import { validarJWT } from "../middlewares/validar-jwt.js";
import { validarRol } from "../middlewares/validar-rol.js";
import { userRol } from "../constants/usuarios.constants.js";
import notificacionesCuotasJob from '../jobs/notificacionesCuotasJob.js';

const { superAdmin } = userRol;

const route = Router();

route.use(validarJWT);
route.get('/', [validarRol(superAdmin)], getEmpresas);
route.get('/usuarios/:empresa_id', [validarRol(superAdmin)], getUsuariosByEmpresa);
route.get('/empresas/:find', [validarRol(superAdmin)], getEmpresaByName);
route.get('/planes', [validarRol(superAdmin)], getPlanes);
route.put('/', [validarRol(superAdmin)], updateEmpresaPlan);
route.delete('/limpiar/:empresa_id', [validarRol(superAdmin)], limpiarDatosEmpresa);

// Endpoint para ejecutar manualmente el job de notificaciones (útil para pruebas)
route.post('/test-notificaciones', [validarRol(superAdmin)], async (req, res) => {
    try {
        console.log('\n🧪 Ejecutando job de notificaciones manualmente (solicitado por admin)...');

        // Ejecutar de forma asíncrona para no bloquear la respuesta
        notificacionesCuotasJob.ejecutarManualmente()
            .then(() => console.log('✅ Job manual completado'))
            .catch(err => console.error('❌ Error en job manual:', err));

        res.json({
            ok: true,
            msg: 'Job de notificaciones iniciado. Revisa los logs del servidor para ver el progreso.'
        });
    } catch (error) {
        console.error('Error iniciando job manual:', error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

export default route;