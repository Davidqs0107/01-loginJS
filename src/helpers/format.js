/**
 * Formatea un monto con el símbolo de la empresa.
 * Mantiene el formato numérico original (sin separador de miles).
 */
export const formatMoney = (n, simbolo = 'Bs.') =>
    `${simbolo} ${parseFloat(n || 0).toFixed(2)}`;

/**
 * Formatea un teléfono con su indicativo.
 * Si no hay teléfono, devuelve string vacío.
 */
export const formatPhone = (telefono, codigoPais = '+591') => {
    if (!telefono) return '';
    return `${codigoPais} ${telefono}`;
};
