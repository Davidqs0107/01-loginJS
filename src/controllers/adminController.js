import { estadoEmpresaPlanes } from "../constants/empresa_planes.constanst.js";
import { getEmpresaByNameService, getEmpresasService, getPlanesService, getUsuariosByEmpresaService, limpiarDatosEmpresaService, updateEmpresaPlanService, updatePlanMaxUsuariosService } from "../services/adminService.js";
import { getSuscripcionesService } from "../services/suscripcionService.js";
import { formatDateWithDateFns } from "../helpers/functions.js"

export const getSuscripciones = async (req, res) => {
    const { estado, page = 1, pageSize = 30 } = req.query; // estado opcional: vigente | por_vencer | vencido
    try {
        const { data, meta } = await getSuscripcionesService({ estado, page, pageSize });
        res.status(200).json({ ok: true, suscripciones: data, meta });
    } catch (error) {
        console.error('Error en getSuscripciones:', error);
        res.status(500).json({ ok: false, msg: 'Error al obtener las suscripciones.' });
    }
};
export const getEmpresas = async (req, res = response) => {
    const dateNow = formatDateWithDateFns(new Date());
    const { page = 1, pageSize = 10, fecha_inicio = dateNow, fecha_fin = dateNow } = req.query;
    try {
        const { data, meta } = await getEmpresasService({ page, pageSize, fecha_inicio, fecha_fin });
        res.status(200).json({
            ok: true,
            empresas: data,
            meta
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error,
        });
    }
};
export const getPlanes = async (req, res = response) => {
    try {
        const planes = await getPlanesService();
        res.status(200).json({
            ok: true,
            planes: planes.data,
            meta: planes.meta
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error,
        });
    }
};
export const updateEmpresaPlan = async (req, res = response) => {
    const { id, dias, plan_id, estado = estadoEmpresaPlanes.activo } = req.body;
    try {
        const empresa = await updateEmpresaPlanService({ id, dias, plan_id, estado });
        res.status(200).json({
            ok: true,
            empresa,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error,
        });
    }
}

export const getUsuariosByEmpresa = async (req, res = response) => {
    const { empresa_id } = req.params;
    try {
        const usuarios = await getUsuariosByEmpresaService(empresa_id);
        res.status(200).json({
            ok: true,
            usuarios,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error,
        });
    }
}

export const getEmpresaByName = async (req, res = response) => {
    const { find } = req.params;
    try {
        const result = await getEmpresaByNameService(find);
        res.status(200).json({
            ok: true,
            empresas: result.data,
            meta: result.meta
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error,
        });
    }
}

export const limpiarDatosEmpresa = async (req, res = response) => {
    const { empresa_id } = req.params;
    try {
        const result = await limpiarDatosEmpresaService(empresa_id);
        res.status(200).json({
            ok: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            msg: error.message || 'Error al limpiar datos de la empresa',
        });
    }
}

export const updatePlanMaxUsuarios = async (req, res = response) => {
    const { id } = req.params;
    const { max_usuarios } = req.body;
    try {
        const plan = await updatePlanMaxUsuariosService(id, max_usuarios);
        return res.status(200).json({
            ok: true,
            plan: plan
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            msg: error.message || 'Error al actualizar el plan'
        });
    }
};