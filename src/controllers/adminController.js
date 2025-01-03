import { estadoEmpresaPlanes } from "../constants/empresa_planes.constanst.js";
import { getEmpresasService, updateEmpresaPlanService } from "../services/adminService.js";

export const getEmpresas = async (req, res = response) => {
    const { page = 1, pageSize = 10 } = req.query;
    try {
        const { data, meta } = await getEmpresasService({ page, pageSize });
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