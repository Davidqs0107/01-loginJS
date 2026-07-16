import { executeQuery } from "../helpers/queryS.js";

// Valores por defecto cuando una empresa todavía no configuró nada.
export const configuracionDefault = {
    mora_activa: false,
    mora_tipo: 'porcentaje_cuota',
    mora_valor: 0,
    mora_dias_gracia: 0,
    mora_tope: null,
    incumplido_dias: 90,
    moneda: 'BOB',
    simbolo_moneda: 'Bs.',
};

export const moraTipos = {
    porcentajeDiarioSaldo: 'porcentaje_diario_saldo', // % diario sobre el saldo pendiente
    porcentajeCuota: 'porcentaje_cuota',              // % único sobre el monto de la cuota
    montoFijoDia: 'monto_fijo_dia',                   // monto fijo por cada día de atraso
};

/**
 * Devuelve la configuración de la empresa. Si no existe, devuelve los valores
 * por defecto (sin crear la fila) para que el resto del sistema siempre tenga
 * un objeto con el que trabajar.
 */
export const getConfiguracionService = async (empresa_id) => {
    const rows = await executeQuery(
        `SELECT * FROM configuracion_empresa WHERE empresa_id = $1`,
        [empresa_id]
    );
    if (rows.length === 0) {
        return { empresa_id, ...configuracionDefault };
    }
    return rows[0];
};

/**
 * Crea o actualiza (upsert) la configuración de la empresa. Solo aplica los
 * campos permitidos que vengan definidos en `data`.
 */
export const upsertConfiguracionService = async (empresa_id, data) => {
    if (data.simbolo_moneda !== undefined) {
        if (typeof data.simbolo_moneda !== 'string' ||
            data.simbolo_moneda.length < 1 ||
            data.simbolo_moneda.length > 5) {
            throw new Error('simbolo_moneda debe tener entre 1 y 5 caracteres.');
        }
    }

    const campos = [
        'mora_activa', 'mora_tipo', 'mora_valor', 'mora_dias_gracia',
        'mora_tope', 'incumplido_dias', 'moneda', 'simbolo_moneda',
    ];

    // Mezclar defaults con lo enviado, tomando solo campos válidos
    const valores = {};
    for (const campo of campos) {
        valores[campo] = data[campo] !== undefined ? data[campo] : configuracionDefault[campo];
    }

    const rows = await executeQuery(
        `INSERT INTO configuracion_empresa
            (empresa_id, mora_activa, mora_tipo, mora_valor, mora_dias_gracia, mora_tope, incumplido_dias, moneda, simbolo_moneda)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (empresa_id) DO UPDATE SET
            mora_activa      = EXCLUDED.mora_activa,
            mora_tipo        = EXCLUDED.mora_tipo,
            mora_valor       = EXCLUDED.mora_valor,
            mora_dias_gracia = EXCLUDED.mora_dias_gracia,
            mora_tope        = EXCLUDED.mora_tope,
            incumplido_dias  = EXCLUDED.incumplido_dias,
            moneda           = EXCLUDED.moneda,
            simbolo_moneda   = EXCLUDED.simbolo_moneda,
            updated_at       = CURRENT_TIMESTAMP
         RETURNING *`,
        [
            empresa_id,
            valores.mora_activa, valores.mora_tipo, valores.mora_valor, valores.mora_dias_gracia,
            valores.mora_tope, valores.incumplido_dias, valores.moneda, valores.simbolo_moneda,
        ]
    );
    return rows[0];
};
