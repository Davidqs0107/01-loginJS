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