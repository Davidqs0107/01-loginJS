# Fix: Problema de Zona Horaria en Fechas

## Problema

El backend devuelve las fechas correctamente en formato UTC:

```json
{
  "fecha_inicio": "2026-01-20T00:00:00.000Z",
  "fecha_pago": "2026-02-04T00:00:00.000Z"
}
```

Sin embargo, el frontend muestra **19/1/2026** en lugar de **20/1/2026** cuando el usuario está en una zona horaria negativa (ej: UTC-4).

Esto sucede porque JavaScript convierte automáticamente las fechas UTC a la zona horaria local del navegador.

## Soluciones

### Opción 1: Parsear solo la parte de la fecha (Más simple)

```javascript
// ❌ Incorrecto - Convierte a zona local
const fecha = new Date("2026-01-20T00:00:00.000Z");
console.log(fecha.toLocaleDateString()); // "19/1/2026" en UTC-4

// ✅ Correcto - Extraer solo la fecha
const fechaString = "2026-01-20T00:00:00.000Z";
const fechaSolo = fechaString.split("T")[0]; // "2026-01-20"
const [año, mes, dia] = fechaSolo.split("-");
const fechaDisplay = `${dia}/${mes}/${año}`; // "20/01/2026"
```

### Opción 2: Usar moment.js con UTC

Si ya usas moment.js:

```javascript
import moment from "moment";

// ✅ Correcto - Forzar UTC
const fecha = moment.utc("2026-01-20T00:00:00.000Z").format("DD/MM/YYYY");
console.log(fecha); // "20/01/2026"
```

### Opción 3: Usar date-fns (Recomendado)

Si usas date-fns:

```javascript
import { format, parseISO } from "date-fns";

// ✅ Correcto - Parsear sin convertir zona horaria
const fechaISO = "2026-01-20T00:00:00.000Z";
const fechaSolo = fechaISO.split("T")[0]; // "2026-01-20"
const fecha = format(parseISO(fechaSolo), "dd/MM/yyyy");
console.log(fecha); // "20/01/2026"
```

### Opción 4: Usar day.js con UTC

Si usas dayjs:

```javascript
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// ✅ Correcto - Usar UTC
const fecha = dayjs.utc("2026-01-20T00:00:00.000Z").format("DD/MM/YYYY");
console.log(fecha); // "20/01/2026"
```

## Función Helper Recomendada

Crear una función para formatear todas las fechas del backend:

```javascript
/**
 * Formatea una fecha UTC del backend al formato local sin conversión de zona horaria
 * @param {string} fechaISO - Fecha en formato ISO 8601 (ej: "2026-01-20T00:00:00.000Z")
 * @param {string} formato - Formato deseado (default: "DD/MM/YYYY")
 * @returns {string} Fecha formateada
 */
export const formatearFechaBackend = (fechaISO, formato = "DD/MM/YYYY") => {
  if (!fechaISO) return "";

  // Extraer solo la parte de fecha sin hora
  const fechaSolo = fechaISO.split("T")[0]; // "2026-01-20"
  const [año, mes, dia] = fechaSolo.split("-");

  // Formatear según el formato solicitado
  if (formato === "DD/MM/YYYY") {
    return `${dia}/${mes}/${año}`;
  } else if (formato === "YYYY-MM-DD") {
    return fechaSolo;
  }

  return fechaSolo;
};

// Uso
const fechaInicio = formatearFechaBackend("2026-01-20T00:00:00.000Z"); // "20/01/2026"
```

## Dónde Aplicar la Corrección

Buscar en el frontend todos los lugares donde se muestran fechas del backend:

1. **Formularios**: Input de tipo date
2. **Tablas**: Columnas de fecha
3. **Cards/Details**: Mostrar fecha del préstamo
4. **Reportes**: Fechas de pago de cuotas

### Ejemplo de corrección en componente:

**Antes:**

```javascript
<td>{new Date(prestamo.fecha_inicio).toLocaleDateString()}</td>
```

**Después:**

```javascript
<td>{formatearFechaBackend(prestamo.fecha_inicio)}</td>
```

## Inputs de tipo Date

Para inputs HTML de tipo `date`, asegurarse de usar solo la fecha:

```javascript
// ❌ Incorrecto
<input
  type="date"
  value={new Date(fecha_inicio).toISOString()}
/>

// ✅ Correcto
<input
  type="date"
  value={fecha_inicio.split('T')[0]} // "2026-01-20"
/>
```

## Verificación

Para verificar que la corrección funciona:

1. Abrir el navegador
2. Cambiar zona horaria del sistema a UTC-4 o UTC-5
3. Verificar que las fechas se muestren correctamente
4. Fecha de inicio: debe mostrar **20/01/2026**
5. Primera cuota quincenal: debe mostrar **04/02/2026** (15 días después)

## Notas Importantes

- El backend ya está corregido y devuelve fechas en UTC correctamente
- Solo hace falta ajustar el frontend para mostrarlas sin conversión de zona horaria
- No modificar las fechas antes de enviarlas al backend (enviar siempre en formato YYYY-MM-DD)
