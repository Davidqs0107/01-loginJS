export const sanitizeFileName = (fileName) => {
    return fileName
        .replace(/[^a-zA-Z0-9._-]/g, '') // Eliminar caracteres especiales
        .replace(/\s+/g, '_')           // Reemplazar espacios con guiones bajos
        .toLowerCase();                 // Convertir a minúsculas
};
