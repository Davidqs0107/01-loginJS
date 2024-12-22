export const buildDynamicQuery = (data) => {
    const campos = [];
    const valores = [];
    const placeholders = [];

    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) { // Ignorar campos sin valor
            campos.push(key);
            valores.push(value);
            placeholders.push(`$${valores.length}`);
        }
    });

    return { campos, valores, placeholders };
};
export const buildWhereClause = (data) => {
    const conditions = [];
    const valores = [];

    Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) { // Ignorar campos sin valor
            conditions.push(`${key} = $${valores.length + 1}`);
            valores.push(value);
        }
    });

    return { whereClause: conditions.join(' AND '), valores };
};


export const buildQueryUpdate = (campos, placeholders, table) => {
    // Generar consulta dinámica para UPDATE
    const setQuery = campos.map((campo, index) => `${campo} = ${placeholders[index]}`).join(', ');

    const query = `
     UPDATE ${table}
     SET ${setQuery}
     WHERE id = $${placeholders.length + 1}
     RETURNING *`;
    return query;
}

export const buildQueryCreate = (campos, placeholders, table) => {
    const query = `
        INSERT INTO ${table} (${campos.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *`;
    return query;
}