import { executeQuery, executeSelect } from "../helpers/queryS.js";

export const getEmpresasService = async (data) => {
    const { page, pageSize, fecha_inicio, fecha_fin } = data;
    try {
        const { data, meta } = await executeSelect(
            `select e.id ,e.nombre ,e.estado , ep.id as "empresa_planes_id",ep.fecha_inicio ,ep.fecha_fin ,ep.estado as "estado_empresa_plan" ,
                    ep.plan_id ,p.nombre as "nombre_plan" ,p.precio ,p.duracion_dias ,e.created_at
                    from empresas e join empresa_planes ep 
                    on e.id = ep.empresa_id 
                    join planes p
                    on ep.plan_id = p.id 
                    and date(e.created_at AT TIME ZONE 'UTC' AT TIME ZONE '-04:00') between $1 and $2`,
            [fecha_inicio, fecha_fin],
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );
        return { data, meta };
    } catch (error) {
        throw error;
    }
};
export const getPlanesService = async () => {
    try {
        const { data, meta } = await executeSelect('SELECT * FROM planes');
        return { data, meta };
    } catch (error) {
        throw error;
    }
};
export const updateEmpresaPlanService = async (data) => {
    const { id, dias, plan_id, estado } = data;
    try {
        const fechaInicio = new Date();
        const fechaFin = new Date();
        fechaFin.setDate(fechaInicio.getDate() + dias);
        const empresa = await executeQuery(
            `update empresa_planes set fecha_inicio = $1, 
            fecha_fin = $2, plan_id = $3,
            estado = $4,
            updated_at = CURRENT_TIMESTAMP 
            where empresa_id = $5  returning *`,
            [fechaInicio, fechaFin, plan_id, estado, id]
        );
        return empresa;
    } catch (error) {
        throw error;
    }
}