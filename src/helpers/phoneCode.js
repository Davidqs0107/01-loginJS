export const PHONE_CODE_REGEX = /^\+\d{1,4}$/;

export const validarPhoneCode = (code) =>
    typeof code === 'string' && PHONE_CODE_REGEX.test(code);

/**
 * Normaliza un indicativo: acepta '+591', '591', '+52 33' y devuelve '+591' / '+5233'.
 * Si llega vacío/null, devuelve el fallback.
 */
export const normalizarPhoneCode = (code, fallback = '+591') => {
    if (!code) return fallback;
    const trimmed = String(code).trim();
    if (!trimmed) return fallback;
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return fallback;
    return `+${digits}`;
};
