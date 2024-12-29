import { buildDynamicQuery, buildQueryUpdate } from "../helpers/buildDynamicQuery.js";
import { executeInsert, executeSelectOne } from "../helpers/queryS.js";

export const getEmpresaByIdService = async (id) => {
    try {
        const empresa = await executeSelectOne('SELECT * FROM empresas WHERE id = $1', [id]);
        return empresa;
    } catch (error) {
        console.error('Error en getEmpresaByIdService:', error);
        throw new Error('Error al obtener la empresa.');

    }
};

export const getSummaryService = async (id) => {
    try {
        const querry = `select 
                (select count(p.id) 
                 from prestamos p 
                 where p.empresa_id = $1 
                   and p.estado_prestamo = 'pendiente') as prestamos_pendientes,
                (select count(p.id) 
                 from prestamos p 
                 where p.empresa_id = $1 
                   and p.estado_prestamo = 'completado') as prestamos_completados,
                (select count(c.id) 
                 from clientes c 
                 where c.empresa_id = $1 
                   and c.estado = true) as clientes_activos,
                (select count(u.id) 
                 from usuarios u 
                 where u.empresa_id = $1 
                   and u.estado = true 
                   and u.rol = 'cobrador') as cobradores_activos;`;
        const empresa = await executeSelectOne(querry, [id]);
        return empresa[0];
    } catch (error) {
        console.error('Error en getSummaryService:', error);
        throw new Error('Error al obtener la empresa.');

    }
}

export const updateEmpresaService = async (id, data) => {
    try {
        const { campos, valores, placeholders } = buildDynamicQuery(data);
        if (campos.length === 0) {
            throw new Error('No se enviaron campos para actualizar');
        }
        const query = buildQueryUpdate(campos, placeholders, 'empresas');
        valores.push(id);
        const empresa = await executeInsert(query, valores);
        return empresa;

    } catch (error) {
        console.error('Error en updateEmpresaService:', error);
        throw error;
    }
}