import { estadoEmpresaPlanes } from "../constants/empresa_planes.constanst.js";
import { getEmpresasService, getPlanesService, getUsuariosByEmpresaService, updateEmpresaPlanService } from "../services/adminService.js";
import { formatDateWithDateFns } from "../helpers/functions.js"
export const getEmpresas = async (req, res = response) => {
    const date = formatDateWithDateFns(new Date());
    const { page = 1, pageSize = 10, fecha_inicio = date, fecha_fin = date } = req.query;
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