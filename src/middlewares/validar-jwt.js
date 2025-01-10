import { response } from "express"
import jwt from "jsonwebtoken";
import { disabledPlanEmpresaService, getPlanByEmpresaId } from "../services/empresaServices.js";
import NodeCache from "node-cache";
import { estadoEmpresaPlanes } from "../constants/empresa_planes.constanst.js";

const cache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 120 }); // 1 hora

export const validarJWT = async (req, res = response, next) => {
    //x-token headers

    const token = req.header('x-token');
    if (!token) {
        return res.status(401).json({
            ok: false,
            message: 'no hay token en la peticion'
        });
    }
    try {
        const { id, name, empresa_id, rol, fecha_fin, plan_id } = jwt.verify(
            token,
            process.env.JWT_SECRET
        );
        if (!rol) {
            return res.status(401).json({
                ok: false,
                message: 'no tiene rol'
            });
        }
        // Verificar si el estado del plan está en cache
        // let plan = cache.get(`plan-${empresa_id}`);

        // if (!plan) {
        //     // Si no está en cache, consultarlo en la base de datos
        //     plan = await getPlanByEmpresaId(empresa_id);
        //     if (!plan) {
        //         return res.status(404).json({
        //             ok: false,
        //             message: 'No se encontró un plan asociado a la empresa'
        //         });
        //     }

        //     // Almacenar el plan en cache
        //     console.log('Plan antes de guardar:', plan);
        //     cache.set(`plan-${empresa_id}`, JSON.stringify(plan[0]));
        //     console.log('Plan almacenado en caché:', cache.get(`plan-${empresa_id}`));
        // }
        const fechaFinPlan = new Date(fecha_fin);
        // const estadoPlan = plan.estado;
        if (fechaFinPlan < new Date()) {
            await disabledPlanEmpresaService(empresa_id);
            return res.status(401).json({
                ok: false,
                message: 'El plan ha expirado'
            });
        }
        req.id = id;
        req.name = name;
        req.empresa_id = empresa_id;
        req.rol = rol;
        req.fecha_fin = fecha_fin;
        req.plan_id = plan_id;
    } catch (error) {
        // cache.del(`plan-${empresa_id}`);
        return res.status(401).json({
            ok: false,
            message: 'no hay token valido'
        })
    }
    next();
}
