# Análisis: Sistema de Mora/Interés Moratorio

## 📋 Resumen Ejecutivo

Implementar un sistema de **mora o interés moratorio** que penalice a los clientes que no paguen sus cuotas en la fecha acordada, calculando un cargo adicional por cada día de atraso.

---

## 🔍 Análisis de Estructura Actual

### Tablas Relevantes

**`cuotas`**

```sql
- id
- prestamo_id
- numero_cuota
- fecha_pago (DATE) ← Fecha límite de pago
- monto (DECIMAL) ← Monto original de la cuota
- monto_pagado (DECIMAL)
- estado (pendiente/pagada/parcial)
- created_at
- updated_at
```

**`pagos`**

```sql
- id
- cuota_id
- usuario_id
- monto
- fecha_pago (TIMESTAMP) ← Fecha en que se realizó el pago
- tipo_pago
- created_at
- updated_at
```

### Situación Actual

✅ Ya se registra la `fecha_pago` esperada en cuotas  
✅ Ya se registra la fecha real del pago en `pagos`  
❌ No hay campo para almacenar mora  
❌ No hay lógica para calcular días de atraso  
❌ No hay configuración de % o monto de mora por empresa

---

## 💡 Opciones de Implementación

### **Opción 1: Mora Dinámica (Cálculo en Tiempo Real)** ⭐ RECOMENDADA

**Concepto:** La mora se calcula dinámicamente al consultar una cuota, sin guardarla en la BD.

**Ventajas:**

- ✅ Siempre actualizado automáticamente
- ✅ No requiere jobs/cron para actualizar
- ✅ Más simple de implementar inicialmente
- ✅ Evita inconsistencias de datos

**Desventajas:**

- ⚠️ Requiere calcular en cada consulta
- ⚠️ Dificulta reportes históricos de mora

**Implementación:**

#### 1. Modificar tabla `empresas` para configuración de mora

```sql
ALTER TABLE empresas
ADD COLUMN mora_tipo VARCHAR(20) DEFAULT 'porcentaje', -- 'porcentaje' o 'monto_fijo'
ADD COLUMN mora_tasa_diaria NUMERIC(5, 4) DEFAULT 0.0050, -- 0.5% diario por defecto
ADD COLUMN mora_monto_fijo NUMERIC(10, 2) DEFAULT 5.00, -- Monto fijo por día
ADD COLUMN mora_dias_gracia INT DEFAULT 0; -- Días de gracia antes de aplicar mora
```

#### 2. Crear función para calcular mora

```javascript
// src/helpers/moraCalculator.js

/**
 * Calcula la mora de una cuota basándose en días de atraso
 * @param {Object} cuota - Cuota con fecha_pago, monto, monto_pagado, estado
 * @param {Object} empresaConfig - Configuración de mora de la empresa
 * @returns {Object} { diasAtraso, montoMora, montoTotal }
 */
export const calcularMora = (cuota, empresaConfig) => {
  const { fecha_pago, monto, monto_pagado, estado } = cuota;
  const {
    mora_tipo = "porcentaje",
    mora_tasa_diaria = 0.005, // 0.5% por día
    mora_monto_fijo = 5.0,
    mora_dias_gracia = 0,
  } = empresaConfig;

  // Si la cuota está pagada, no hay mora
  if (estado === "pagada") {
    return {
      diasAtraso: 0,
      montoMora: 0,
      montoTotal: parseFloat(monto),
      aplicaMora: false,
    };
  }

  // Calcular días de atraso
  const fechaLimite = new Date(fecha_pago);
  const fechaHoy = new Date();
  fechaHoy.setHours(0, 0, 0, 0); // Normalizar a medianoche

  const diasAtraso = Math.floor(
    (fechaHoy - fechaLimite) / (1000 * 60 * 60 * 24),
  );
  const diasAtrasoReal = Math.max(0, diasAtraso - mora_dias_gracia);

  // Si no hay atraso, no hay mora
  if (diasAtrasoReal <= 0) {
    return {
      diasAtraso: 0,
      montoMora: 0,
      montoTotal: parseFloat(monto),
      aplicaMora: false,
    };
  }

  // Calcular monto de mora según tipo
  let montoMora = 0;
  const saldoPendiente = parseFloat(monto) - parseFloat(monto_pagado || 0);

  if (mora_tipo === "porcentaje") {
    // Mora porcentual sobre el saldo pendiente
    // Ejemplo: 0.5% diario sobre $100 por 10 días = $100 * 0.005 * 10 = $5
    montoMora = saldoPendiente * parseFloat(mora_tasa_diaria) * diasAtrasoReal;
  } else if (mora_tipo === "monto_fijo") {
    // Monto fijo por día
    // Ejemplo: $5 por día * 10 días = $50
    montoMora = parseFloat(mora_monto_fijo) * diasAtrasoReal;
  }

  // Redondear a 2 decimales
  montoMora = Math.round(montoMora * 100) / 100;

  return {
    diasAtraso: diasAtrasoReal,
    montoMora,
    montoTotal: saldoPendiente + montoMora,
    saldoSinMora: saldoPendiente,
    aplicaMora: true,
    tasaDiaria: mora_tipo === "porcentaje" ? mora_tasa_diaria : null,
    montoFijo: mora_tipo === "monto_fijo" ? mora_monto_fijo : null,
    diasGracia: mora_dias_gracia,
  };
};
```

#### 3. Modificar servicios para incluir mora

```javascript
// En src/services/cuotaServices.js

import { calcularMora } from "../helpers/moraCalculator.js";

export const getCuotasByPrestamoIdConMora = async (data) => {
  const { page, pageSize, prestamo_id, empresa_id } = data;

  try {
    // Obtener configuración de mora de la empresa
    const empresaConfig = await executeSelectOne(
      `SELECT mora_tipo, mora_tasa_diaria, mora_monto_fijo, mora_dias_gracia 
             FROM empresas WHERE id = $1`,
      [empresa_id],
    );

    // Obtener cuotas
    const cuotasResult = await executeSelect(
      `SELECT c.*, p.cliente_id, p.usuario_id
             FROM cuotas c
             JOIN prestamos p ON p.id = c.prestamo_id
             WHERE c.prestamo_id = $1 AND p.empresa_id = $2
             ORDER BY c.numero_cuota ASC`,
      [prestamo_id, empresa_id],
      parseInt(page, 10),
      parseInt(pageSize, 10),
    );

    // Agregar cálculo de mora a cada cuota
    const cuotasConMora = cuotasResult.data.map((cuota) => {
      const mora = calcularMora(cuota, empresaConfig[0] || {});
      return {
        ...cuota,
        mora: mora,
      };
    });

    return {
      ...cuotasResult,
      data: cuotasConMora,
    };
  } catch (error) {
    throw error;
  }
};
```

#### 4. Modificar servicio de pagos para registrar mora

```javascript
// En src/services/pagosServices.js

export const crearPagoConMora = async (data) => {
  const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago, empresa_id } =
    data;

  try {
    const res = await executeTransaction(async (client) => {
      // Obtener cuota y configuración de mora
      const cuotaQuery = `
                SELECT c.*, e.mora_tipo, e.mora_tasa_diaria, 
                       e.mora_monto_fijo, e.mora_dias_gracia
                FROM cuotas c
                JOIN prestamos p ON p.id = c.prestamo_id
                JOIN empresas e ON e.id = p.empresa_id
                WHERE c.id = $1`;

      const cuotaResult = await client.query(cuotaQuery, [cuota_id]);

      if (cuotaResult.rowCount === 0) {
        throw new Error("No se encontró la cuota especificada.");
      }

      const cuota = cuotaResult.rows[0];

      // Calcular mora actual
      const mora = calcularMora(cuota, cuota);

      // Validar que el monto cubra al menos el saldo + mora
      const montoRequerido = mora.montoTotal;

      if (monto < montoRequerido) {
        throw new Error(
          `El monto es insuficiente. Saldo: $${mora.saldoSinMora.toFixed(2)}, ` +
            `Mora: $${mora.montoMora.toFixed(2)}, ` +
            `Total requerido: $${montoRequerido.toFixed(2)}`,
        );
      }

      // Insertar el pago
      const insertarPagoQuery = `
                INSERT INTO pagos (cuota_id, usuario_id, monto, tipo_pago, fecha_pago)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id`;

      const pagoResult = await client.query(insertarPagoQuery, [
        cuota_id,
        usuario_id,
        monto,
        tipo_pago,
        fecha_pago,
      ]);

      // Actualizar cuota
      const nuevoMontoPagado =
        parseFloat(cuota.monto_pagado || 0) + parseFloat(cuota.monto);
      const nuevoEstado = "pagada";

      const actualizarCuotaQuery = `
                UPDATE cuotas
                SET monto_pagado = $1, estado = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *`;

      await client.query(actualizarCuotaQuery, [
        nuevoMontoPagado,
        nuevoEstado,
        cuota_id,
      ]);

      return {
        pagoId: pagoResult.rows[0].id,
        montoAplicado: monto,
        desglose: {
          saldoCuota: mora.saldoSinMora,
          montoMora: mora.montoMora,
          diasAtraso: mora.diasAtraso,
          excedente: monto - montoRequerido,
        },
      };
    });

    return res;
  } catch (error) {
    throw error;
  }
};
```

---

### **Opción 2: Mora Estática (Guardada en BD)**

**Concepto:** La mora se calcula y guarda en la tabla de cuotas periódicamente.

**Ventajas:**

- ✅ Consultas más rápidas
- ✅ Historial exacto de mora aplicada
- ✅ Facilita reportes

**Desventajas:**

- ⚠️ Requiere job/cron para actualizar diariamente
- ⚠️ Mayor complejidad en la base de datos
- ⚠️ Posibles inconsistencias si falla el job

**Implementación:**

#### 1. Modificar tabla `cuotas`

```sql
ALTER TABLE cuotas
ADD COLUMN mora_acumulada NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN mora_dias_atraso INT DEFAULT 0,
ADD COLUMN mora_ultima_actualizacion TIMESTAMPTZ;
```

#### 2. Crear job para actualizar mora diariamente

```javascript
// src/jobs/actualizarMoraJob.js
import cron from "node-cron";
import { calcularMora } from "../helpers/moraCalculator.js";

// Ejecutar diariamente a las 00:30
cron.schedule("30 0 * * *", async () => {
  console.log("Actualizando mora de cuotas...");

  try {
    const cuotasPendientes = await obtenerCuotasPendientes();

    for (const cuota of cuotasPendientes) {
      const empresaConfig = await obtenerConfigEmpresa(cuota.empresa_id);
      const mora = calcularMora(cuota, empresaConfig);

      await actualizarMoraCuota(cuota.id, mora);
    }

    console.log("Mora actualizada exitosamente");
  } catch (error) {
    console.error("Error al actualizar mora:", error);
  }
});
```

---

### **Opción 3: Sistema Híbrido** 🚀 MÁS ROBUSTO

**Concepto:** Combinar ambos enfoques para máxima flexibilidad.

**Características:**

- Calcular mora dinámicamente en consultas
- Guardar mora aplicada al momento del pago (histórico)
- Tabla adicional para auditoría de mora

**Ventajas:**

- ✅ Mejor de ambos mundos
- ✅ Historial detallado
- ✅ Siempre actualizado

**Implementación:**

#### 1. Nueva tabla `mora_historial`

```sql
CREATE TABLE mora_historial (
    id BIGSERIAL PRIMARY KEY,
    cuota_id BIGINT NOT NULL REFERENCES cuotas(id),
    pago_id BIGINT REFERENCES pagos(id),
    dias_atraso INT NOT NULL,
    monto_mora NUMERIC(15, 2) NOT NULL,
    fecha_calculo TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tipo_calculo VARCHAR(20), -- 'automatico', 'manual', 'condonado'
    usuario_id BIGINT REFERENCES usuarios(id),
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mora_historial_cuota ON mora_historial(cuota_id);
CREATE INDEX idx_mora_historial_pago ON mora_historial(pago_id);
```

#### 2. Registrar mora al realizar pago

```javascript
// Al procesar un pago, registrar la mora aplicada
const registrarMora = async (client, cuotaId, pagoId, mora, usuarioId) => {
  if (mora.aplicaMora && mora.montoMora > 0) {
    await client.query(
      `INSERT INTO mora_historial 
             (cuota_id, pago_id, dias_atraso, monto_mora, tipo_calculo, usuario_id)
             VALUES ($1, $2, $3, $4, 'automatico', $5)`,
      [cuotaId, pagoId, mora.diasAtraso, mora.montoMora, usuarioId],
    );
  }
};
```

---

## 📊 Comparación de Opciones

| Característica    | Opción 1: Dinámica | Opción 2: Estática | Opción 3: Híbrida |
| ----------------- | ------------------ | ------------------ | ----------------- |
| **Complejidad**   | Baja               | Media              | Alta              |
| **Performance**   | Media              | Alta               | Media             |
| **Precisión**     | Siempre actual     | Depende de job     | Siempre actual    |
| **Historial**     | No                 | Sí                 | Sí (detallado)    |
| **Reportes**      | Complejo           | Fácil              | Fácil             |
| **Mantenimiento** | Bajo               | Alto               | Medio             |
| **Flexibilidad**  | Alta               | Baja               | Muy Alta          |

---

## 🎯 Recomendación Final

### Para MVP/Inicio: **Opción 1 (Dinámica)** ⭐

**Razones:**

1. Más rápido de implementar
2. Menor complejidad técnica
3. No requiere infraestructura adicional (cron jobs)
4. Fácil de ajustar/probar

### Para Producción/Escalabilidad: **Opción 3 (Híbrida)** 🚀

**Razones:**

1. Mejor trazabilidad y auditoría
2. Reportes históricos precisos
3. Permite condonaciones manuales de mora
4. Flexibilidad para casos especiales

---

## 🔧 Configuraciones Recomendadas

### Tasas de Mora Comunes

```javascript
// Mora conservadora
{
    mora_tipo: 'porcentaje',
    mora_tasa_diaria: 0.001,  // 0.1% diario = 3% mensual
    mora_dias_gracia: 3
}

// Mora moderada (RECOMENDADA)
{
    mora_tipo: 'porcentaje',
    mora_tasa_diaria: 0.005,  // 0.5% diario = 15% mensual
    mora_dias_gracia: 0
}

// Mora agresiva
{
    mora_tipo: 'porcentaje',
    mora_tasa_diaria: 0.01,   // 1% diario = 30% mensual
    mora_dias_gracia: 0
}

// Monto fijo (útil para préstamos pequeños)
{
    mora_tipo: 'monto_fijo',
    mora_monto_fijo: 5.00,    // $5 por día
    mora_dias_gracia: 2
}
```

---

## � Estrategias de Pago con Mora

### Problema: ¿Permitir pagos parciales cuando hay mora?

Existen **4 estrategias** principales para manejar pagos cuando hay mora acumulada:

---

### **Estrategia 1: Pago Total Obligatorio** 🔒 MÁS ESTRICTA

**Regla:** No se aceptan pagos parciales. El cliente DEBE pagar el monto completo (saldo + mora).

**Ventajas:**

- ✅ Incentiva pago puntual
- ✅ Evita que la mora siga creciendo
- ✅ Más simple de implementar
- ✅ Cierra la cuota de una vez

**Desventajas:**

- ⚠️ Puede ser muy duro para clientes con problemas financieros
- ⚠️ Puede generar abandono de pago
- ⚠️ Poca flexibilidad

**Implementación:**

```javascript
// En crearPagoConMora
const mora = calcularMora(cuota, empresaConfig);
const montoMinimo = mora.montoTotal; // Saldo + Mora completa

if (monto < montoMinimo) {
  throw new Error(
    `Pago rechazado. Debe pagar el monto completo.\n` +
      `Saldo cuota: $${mora.saldoSinMora.toFixed(2)}\n` +
      `Mora (${mora.diasAtraso} días): $${mora.montoMora.toFixed(2)}\n` +
      `Total requerido: $${montoMinimo.toFixed(2)}\n` +
      `Recibido: $${monto.toFixed(2)}\n` +
      `Faltante: $${(montoMinimo - monto).toFixed(2)}`,
  );
}

// Procesar pago completo
```

**Cuándo usar:** Préstamos pequeños, clientes con historial de incumplimiento.

---

### **Estrategia 2: Mora Primero, Luego Saldo** 💵 RECOMENDADA

**Regla:** Aceptar pagos parciales, pero aplicar primero a la mora, luego al saldo de la cuota.

**Ventajas:**

- ✅ Flexibilidad para el cliente
- ✅ Garantiza que la mora se pague primero
- ✅ Evita que la mora siga creciendo indefinidamente
- ✅ Más justo financieramente

**Desventajas:**

- ⚠️ La cuota puede quedar parcial por mucho tiempo
- ⚠️ Más compleja de implementar

**Implementación:**

```javascript
export const crearPagoConMoraFlexible = async (data) => {
  const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago, empresa_id } =
    data;

  try {
    const res = await executeTransaction(async (client) => {
      // Obtener cuota y configuración
      const cuotaQuery = `
                SELECT c.*, e.mora_tipo, e.mora_tasa_diaria, 
                       e.mora_monto_fijo, e.mora_dias_gracia
                FROM cuotas c
                JOIN prestamos p ON p.id = c.prestamo_id
                JOIN empresas e ON e.id = p.empresa_id
                WHERE c.id = $1`;

      const cuotaResult = await client.query(cuotaQuery, [cuota_id]);
      const cuota = cuotaResult.rows[0];

      // Calcular mora actual
      const mora = calcularMora(cuota, cuota);

      let montoPendiente = parseFloat(monto);
      let moraAplicada = 0;
      let saldoAplicado = 0;

      // PASO 1: Aplicar pago a la MORA primero
      if (mora.aplicaMora && mora.montoMora > 0) {
        moraAplicada = Math.min(montoPendiente, mora.montoMora);
        montoPendiente -= moraAplicada;
      }

      // PASO 2: Aplicar el resto al SALDO de la cuota
      if (montoPendiente > 0) {
        const saldoPendiente = mora.saldoSinMora;
        saldoAplicado = Math.min(montoPendiente, saldoPendiente);
        montoPendiente -= saldoAplicado;
      }

      const nuevoMontoPagado =
        parseFloat(cuota.monto_pagado || 0) + saldoAplicado;
      const saldoRestante = parseFloat(cuota.monto) - nuevoMontoPagado;

      // Determinar nuevo estado
      let nuevoEstado;
      if (saldoRestante <= 0) {
        nuevoEstado = "pagada";
      } else if (nuevoMontoPagado > 0) {
        nuevoEstado = "parcial";
      } else {
        nuevoEstado = "pendiente";
      }

      // Insertar el pago
      const insertarPagoQuery = `
                INSERT INTO pagos (cuota_id, usuario_id, monto, tipo_pago, fecha_pago)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id`;

      const pagoResult = await client.query(insertarPagoQuery, [
        cuota_id,
        usuario_id,
        monto,
        tipo_pago,
        fecha_pago,
      ]);

      // Actualizar cuota
      const actualizarCuotaQuery = `
                UPDATE cuotas
                SET monto_pagado = $1, estado = $2, updated_at = NOW()
                WHERE id = $3`;

      await client.query(actualizarCuotaQuery, [
        nuevoMontoPagado,
        nuevoEstado,
        cuota_id,
      ]);

      // Si hay mora aplicada, registrarla en historial (Opción 3)
      if (moraAplicada > 0) {
        await client.query(
          `INSERT INTO mora_historial 
                     (cuota_id, pago_id, dias_atraso, monto_mora, tipo_calculo, usuario_id)
                     VALUES ($1, $2, $3, $4, 'automatico', $5)`,
          [
            cuota_id,
            pagoResult.rows[0].id,
            mora.diasAtraso,
            moraAplicada,
            usuario_id,
          ],
        );
      }

      return {
        pagoId: pagoResult.rows[0].id,
        montoRecibido: parseFloat(monto),
        desglose: {
          aplicadoMora: moraAplicada,
          aplicadoSaldo: saldoAplicado,
          excedente: montoPendiente,
          diasAtraso: mora.diasAtraso,
          moraTotal: mora.montoMora,
          moraPendiente: Math.max(0, mora.montoMora - moraAplicada),
          saldoRestante: saldoRestante,
          estadoCuota: nuevoEstado,
        },
        mensaje: generarMensajePago(
          moraAplicada,
          saldoAplicado,
          mora,
          saldoRestante,
        ),
      };
    });

    return res;
  } catch (error) {
    throw error;
  }
};

const generarMensajePago = (
  moraAplicada,
  saldoAplicado,
  mora,
  saldoRestante,
) => {
  let mensaje = "Pago procesado exitosamente.\n\n";

  if (moraAplicada > 0) {
    mensaje += `✅ Mora pagada: $${moraAplicada.toFixed(2)} (${mora.diasAtraso} días)\n`;
  }

  if (saldoAplicado > 0) {
    mensaje += `✅ Abono a cuota: $${saldoAplicado.toFixed(2)}\n`;
  }

  if (saldoRestante > 0) {
    mensaje += `\n⚠️ Saldo pendiente: $${saldoRestante.toFixed(2)}\n`;
    mensaje += `IMPORTANTE: La mora seguirá acumulándose sobre este saldo.`;
  } else {
    mensaje += `\n🎉 ¡Cuota pagada completamente!`;
  }

  return mensaje;
};
```

**Ejemplo de uso:**

```javascript
// Cliente debe: $100 saldo + $10 mora
// Escenario 1: Paga $50
// Resultado: $10 a mora, $40 a saldo
// Quedan: $0 mora, $60 saldo (mañana generará nueva mora sobre $60)

// Escenario 2: Paga $8
// Resultado: $8 a mora, $0 a saldo
// Quedan: $2 mora, $100 saldo (mañana mora será sobre $100)

// Escenario 3: Paga $110
// Resultado: $10 a mora, $100 a saldo
// Quedan: $0 mora, $0 saldo ✅ CUOTA PAGADA
```

**Cuándo usar:** Mayoría de casos, clientes recurrentes, buena relación comercial.

---

### **Estrategia 3: Saldo Primero, Mora Después** 📊 POCO COMÚN

**Regla:** Aplicar pago primero al saldo de la cuota, luego a la mora.

**Ventajas:**

- ✅ Reduce el capital más rápido
- ✅ Beneficia al cliente

**Desventajas:**

- ⚠️ La mora puede crecer indefinidamente
- ⚠️ Menos rentable para el prestamista
- ⚠️ No incentiva pagar a tiempo

**Implementación:** Similar a Estrategia 2, invertir el orden de aplicación.

**Cuándo usar:** Casos especiales, condonaciones, acuerdos de pago.

---

### **Estrategia 4: Distribución Proporcional** ⚖️ MÁS JUSTA

**Regla:** El pago se distribuye proporcionalmente entre saldo y mora.

**Ventajas:**

- ✅ Matemáticamente justo
- ✅ Reduce ambos componentes

**Desventajas:**

- ⚠️ Más complejo de explicar al cliente
- ⚠️ La mora sigue creciendo

**Implementación:**

```javascript
// Si debe: $100 saldo + $10 mora = $110 total
// Paga: $55
// Proporción saldo: 100/110 = 90.9%
// Proporción mora: 10/110 = 9.1%
// Aplicado saldo: $55 * 0.909 = $50
// Aplicado mora: $55 * 0.091 = $5
// Quedan: $50 saldo + $5 mora
```

**Cuándo usar:** Raramente, solo si el cliente lo solicita.

---

## 🎯 Comparación de Estrategias

| Aspecto                 | Total Obligatorio | Mora Primero  | Saldo Primero    | Proporcional |
| ----------------------- | ----------------- | ------------- | ---------------- | ------------ |
| **Simplicidad**         | ⭐⭐⭐⭐⭐        | ⭐⭐⭐⭐      | ⭐⭐⭐⭐         | ⭐⭐         |
| **Flexibilidad**        | ⭐                | ⭐⭐⭐⭐      | ⭐⭐⭐⭐         | ⭐⭐⭐       |
| **Protege prestamista** | ⭐⭐⭐⭐⭐        | ⭐⭐⭐⭐      | ⭐⭐             | ⭐⭐⭐       |
| **Beneficia cliente**   | ⭐                | ⭐⭐⭐        | ⭐⭐⭐⭐         | ⭐⭐⭐       |
| **Claridad**            | ⭐⭐⭐⭐⭐        | ⭐⭐⭐⭐      | ⭐⭐⭐⭐         | ⭐⭐         |
| **Recomendación**       | Inicio/Estricto   | **⭐ NORMAL** | Casos especiales | Avanzado     |

---

## 🏆 Recomendación Final: **Estrategia 2 con Monto Mínimo**

Combinar lo mejor de ambas estrategias:

### **Reglas Híbridas:**

1. **Si mora < 20% del saldo:** Permitir pagos parciales (Estrategia 2)
2. **Si mora >= 20% del saldo:** Exigir pago de mora completa primero
3. **Siempre:** Establecer un monto mínimo de pago (ej: 10% del total)

**Implementación:**

```javascript
export const crearPagoInteligente = async (data) => {
  const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago } = data;

  try {
    const res = await executeTransaction(async (client) => {
      // ... obtener cuota y calcular mora ...

      const mora = calcularMora(cuota, empresaConfig);
      const porcentajeMora = (mora.montoMora / mora.saldoSinMora) * 100;

      // Definir monto mínimo
      const MONTO_MINIMO_PORCENTAJE = 0.1; // 10% del total
      const MORA_CRITICA_PORCENTAJE = 20; // 20%

      const montoMinimo = mora.montoTotal * MONTO_MINIMO_PORCENTAJE;

      // Validación 1: Monto mínimo
      if (monto < montoMinimo) {
        throw new Error(
          `El monto debe ser al menos $${montoMinimo.toFixed(2)} ` +
            `(10% del total adeudado)`,
        );
      }

      // Validación 2: Mora crítica
      if (porcentajeMora >= MORA_CRITICA_PORCENTAJE && monto < mora.montoMora) {
        throw new Error(
          `La mora ha alcanzado el ${porcentajeMora.toFixed(1)}% del saldo.\n` +
            `Debe pagar primero la mora completa: $${mora.montoMora.toFixed(2)}\n` +
            `Recibido: $${monto.toFixed(2)}\n` +
            `Faltante: $${(mora.montoMora - monto).toFixed(2)}`,
        );
      }

      // Aplicar pago usando Estrategia 2 (Mora primero)
      let montoPendiente = parseFloat(monto);
      let moraAplicada = 0;
      let saldoAplicado = 0;

      // Paso 1: Pagar mora
      if (mora.aplicaMora && mora.montoMora > 0) {
        moraAplicada = Math.min(montoPendiente, mora.montoMora);
        montoPendiente -= moraAplicada;
      }

      // Paso 2: Pagar saldo
      if (montoPendiente > 0) {
        saldoAplicado = Math.min(montoPendiente, mora.saldoSinMora);
        montoPendiente -= saldoAplicado;
      }

      // ... continuar con actualización de cuota y registro de pago ...

      return {
        pagoId: pagoResult.rows[0].id,
        desglose: {
          moraAplicada,
          saldoAplicado,
          excedente: montoPendiente,
          porcentajeMora: porcentajeMora.toFixed(2),
          estadoCritico: porcentajeMora >= MORA_CRITICA_PORCENTAJE,
        },
      };
    });

    return res;
  } catch (error) {
    throw error;
  }
};
```

---

## 📊 Tabla de Decisión Rápida

```
Situación                           → Acción
═══════════════════════════════════════════════════════════════════
Mora = $0                           → Pago normal al saldo
Mora < 20% del saldo                → Permitir pago parcial (mora primero)
Mora >= 20% del saldo               → Exigir pagar mora completa
Pago < 10% del total                → Rechazar pago (muy pequeño)
Pago >= 100% del total              → Aceptar y cerrar cuota
Cliente con historial bueno         → Flexibilidad en pagos parciales
Cliente con historial malo          → Exigir pagos completos
```

---

## 💡 Consejos de UX para el Frontend

### Mostrar claramente al cliente:

```
┌─────────────────────────────────────────┐
│  CUOTA #3 - VENCIDA                     │
├─────────────────────────────────────────┤
│  Monto original:        $100.00         │
│  Ya pagado:             $  0.00         │
│  Saldo pendiente:       $100.00         │
│                                         │
│  ⚠️ DÍAS VENCIDOS: 15 días              │
│  Mora acumulada:        $ 15.00         │
│  ─────────────────────────────────      │
│  TOTAL A PAGAR:         $115.00         │
│                                         │
│  Monto mínimo:          $ 11.50         │
│  (10% del total)                        │
└─────────────────────────────────────────┘

[ $ ________ ]  [PAGAR]

✓ Primero se aplicará a la mora
✓ El resto se aplicará al saldo
⚠️ Si no paga todo, la mora seguirá
  acumulándose sobre el saldo restante
```

---

## �📱 Experiencia de Usuario

### En el Frontend

**Al consultar cuotas:**

```json
{
  "id": 123,
  "numero_cuota": 1,
  "fecha_pago": "2026-01-20",
  "monto": 100.0,
  "monto_pagado": 0.0,
  "estado": "pendiente",
  "mora": {
    "aplicaMora": true,
    "diasAtraso": 9,
    "montoMora": 4.5,
    "saldoSinMora": 100.0,
    "montoTotal": 104.5,
    "diasGracia": 0
  }
}
```

**Mostrar en la interfaz:**

```
Cuota #1
Monto original: $100.00
Días de atraso: 9 días
Mora acumulada: $4.50
─────────────────────
TOTAL A PAGAR: $104.50
```

---

## 💾 Tabla de Historial de Pagos de Mora

### ¿Cuándo registrar pagos de mora?

Existen **2 enfoques** principales:

---

### **Enfoque A: Registrar solo cuando se paga mora COMPLETA**

**Concepto:** Solo crear registro cuando `moraAplicada >= moraTotalCuota`

**Ventajas:**

- ✅ Tabla más limpia
- ✅ Menos registros
- ✅ Marca claramente cuándo se "cerró" la mora de una cuota

**Desventajas:**

- ⚠️ Pierde detalle de pagos parciales de mora
- ⚠️ No muestra la evolución de pagos
- ⚠️ Dificulta análisis de comportamiento de pago

**Cuándo usar:** Si solo te interesa saber cuándo se cerró la mora.

---

### **Enfoque B: Registrar cada pago que incluya mora** ⭐ RECOMENDADO

**Concepto:** Crear registro CADA vez que un pago incluya algo de mora, aunque sea parcial.

**Ventajas:**

- ✅ Historial completo y detallado
- ✅ Trazabilidad total de cada centavo
- ✅ Facilita auditorías
- ✅ Permite análisis de comportamiento
- ✅ Útil para reportes contables

**Desventajas:**

- ⚠️ Más registros en la tabla
- ⚠️ Ligeramente más complejo

**Cuándo usar:** Producción, contabilidad seria, auditorías.

---

## 📊 Diseño de Tabla `pagos_mora`

### Opción Completa (Recomendada)

```sql
-- Tabla para registrar pagos de mora
CREATE TABLE pagos_mora (
    id BIGSERIAL PRIMARY KEY,
    cuota_id BIGINT NOT NULL REFERENCES cuotas(id) ON DELETE CASCADE,
    pago_id BIGINT NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id),

    -- Información de la mora
    dias_atraso INT NOT NULL,
    tasa_aplicada NUMERIC(5, 4), -- Tasa diaria aplicada (ej: 0.0050 = 0.5%)
    monto_mora_calculado NUMERIC(15, 2) NOT NULL, -- Mora total calculada en ese momento
    monto_mora_pagado NUMERIC(15, 2) NOT NULL, -- Cuánto de mora pagó en este pago

    -- Estado
    tipo_registro VARCHAR(20) DEFAULT 'pago', -- 'pago', 'condonacion', 'ajuste'
    es_pago_completo BOOLEAN DEFAULT false, -- true si pagó toda la mora de la cuota

    -- Auditoría
    notas TEXT,
    fecha_registro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_monto_mora_pagado CHECK (monto_mora_pagado > 0),
    CONSTRAINT chk_monto_pagado_menor_calculado CHECK (monto_mora_pagado <= monto_mora_calculado)
);

-- Índices para optimizar consultas
CREATE INDEX idx_pagos_mora_cuota ON pagos_mora(cuota_id);
CREATE INDEX idx_pagos_mora_pago ON pagos_mora(pago_id);
CREATE INDEX idx_pagos_mora_usuario ON pagos_mora(usuario_id);
CREATE INDEX idx_pagos_mora_fecha ON pagos_mora(fecha_registro);
CREATE INDEX idx_pagos_mora_tipo ON pagos_mora(tipo_registro);

-- Vista para facilitar consultas
CREATE OR REPLACE VIEW v_resumen_pagos_mora AS
SELECT
    pm.cuota_id,
    c.numero_cuota,
    c.prestamo_id,
    COUNT(pm.id) as cantidad_pagos_mora,
    SUM(pm.monto_mora_pagado) as total_mora_pagada,
    MAX(pm.dias_atraso) as dias_atraso_maximo,
    MIN(pm.fecha_registro) as primer_pago_mora,
    MAX(pm.fecha_registro) as ultimo_pago_mora,
    bool_or(pm.es_pago_completo) as mora_completamente_pagada
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
GROUP BY pm.cuota_id, c.numero_cuota, c.prestamo_id;
```

### Campos Explicados:

| Campo                  | Propósito                                   |
| ---------------------- | ------------------------------------------- |
| `cuota_id`             | A qué cuota pertenece la mora               |
| `pago_id`              | Qué pago incluyó esta mora                  |
| `dias_atraso`          | Cuántos días de atraso tenía la cuota       |
| `monto_mora_calculado` | Total de mora acumulada en ese momento      |
| `monto_mora_pagado`    | Cuánto de mora pagó en este pago específico |
| `es_pago_completo`     | Si este pago cerró completamente la mora    |
| `tipo_registro`        | Si fue pago normal, condonación o ajuste    |

---

## 🔧 Implementación del Registro

### Función para registrar pago de mora:

```javascript
// src/helpers/registrarPagoMora.js

/**
 * Registra un pago de mora en el historial
 * @param {Object} client - Cliente de transacción de PostgreSQL
 * @param {Object} data - Datos del pago de mora
 * @returns {Promise<Object>} Resultado del registro
 */
export const registrarPagoMora = async (client, data) => {
  const {
    cuota_id,
    pago_id,
    usuario_id,
    dias_atraso,
    tasa_aplicada,
    monto_mora_calculado,
    monto_mora_pagado,
    tipo_registro = "pago",
    notas = null,
  } = data;

  // Validación básica
  if (monto_mora_pagado <= 0) {
    throw new Error("El monto de mora pagado debe ser mayor a 0");
  }

  if (monto_mora_pagado > monto_mora_calculado) {
    throw new Error("El monto pagado no puede ser mayor al mora calculada");
  }

  // Determinar si es pago completo
  const tolerancia = 0.01; // 1 centavo de tolerancia
  const es_pago_completo =
    Math.abs(monto_mora_pagado - monto_mora_calculado) <= tolerancia;

  const query = `
        INSERT INTO pagos_mora (
            cuota_id, 
            pago_id, 
            usuario_id, 
            dias_atraso, 
            tasa_aplicada,
            monto_mora_calculado, 
            monto_mora_pagado, 
            tipo_registro,
            es_pago_completo,
            notas
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`;

  const values = [
    cuota_id,
    pago_id,
    usuario_id,
    dias_atraso,
    tasa_aplicada,
    monto_mora_calculado,
    monto_mora_pagado,
    tipo_registro,
    es_pago_completo,
    notas,
  ];

  const result = await client.query(query, values);

  return {
    id: result.rows[0].id,
    es_pago_completo: result.rows[0].es_pago_completo,
    mensaje: es_pago_completo
      ? "✅ Mora pagada completamente"
      : `⚠️ Pago parcial de mora. Quedan $${(monto_mora_calculado - monto_mora_pagado).toFixed(2)}`,
  };
};
```

### Integrar en el servicio de pago:

```javascript
// En src/services/pagosServices.js

import { registrarPagoMora } from "../helpers/registrarPagoMora.js";

export const crearPagoConMoraYRegistro = async (data) => {
  const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago, empresa_id } =
    data;

  try {
    const res = await executeTransaction(async (client) => {
      // 1. Obtener cuota y configuración
      const cuotaQuery = `
                SELECT c.*, e.mora_tipo, e.mora_tasa_diaria, 
                       e.mora_monto_fijo, e.mora_dias_gracia
                FROM cuotas c
                JOIN prestamos p ON p.id = c.prestamo_id
                JOIN empresas e ON e.id = p.empresa_id
                WHERE c.id = $1`;

      const cuotaResult = await client.query(cuotaQuery, [cuota_id]);
      const cuota = cuotaResult.rows[0];

      // 2. Calcular mora actual
      const mora = calcularMora(cuota, cuota);

      let montoPendiente = parseFloat(monto);
      let moraAplicada = 0;
      let saldoAplicado = 0;

      // 3. Aplicar pago a la MORA primero
      if (mora.aplicaMora && mora.montoMora > 0) {
        moraAplicada = Math.min(montoPendiente, mora.montoMora);
        montoPendiente -= moraAplicada;
      }

      // 4. Aplicar el resto al SALDO de la cuota
      if (montoPendiente > 0) {
        const saldoPendiente = mora.saldoSinMora;
        saldoAplicado = Math.min(montoPendiente, saldoPendiente);
        montoPendiente -= saldoAplicado;
      }

      // 5. Insertar el pago principal
      const insertarPagoQuery = `
                INSERT INTO pagos (cuota_id, usuario_id, monto, tipo_pago, fecha_pago)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id`;

      const pagoResult = await client.query(insertarPagoQuery, [
        cuota_id,
        usuario_id,
        monto,
        tipo_pago,
        fecha_pago,
      ]);

      const pagoId = pagoResult.rows[0].id;

      // 6. ⭐ REGISTRAR PAGO DE MORA (si hubo mora pagada)
      let registroMora = null;
      if (moraAplicada > 0) {
        registroMora = await registrarPagoMora(client, {
          cuota_id,
          pago_id: pagoId,
          usuario_id,
          dias_atraso: mora.diasAtraso,
          tasa_aplicada: mora.tasaDiaria,
          monto_mora_calculado: mora.montoMora,
          monto_mora_pagado: moraAplicada,
          tipo_registro: "pago",
          notas: `Pago automático de mora. ${mora.diasAtraso} días de atraso.`,
        });
      }

      // 7. Actualizar cuota
      const nuevoMontoPagado =
        parseFloat(cuota.monto_pagado || 0) + saldoAplicado;
      const saldoRestante = parseFloat(cuota.monto) - nuevoMontoPagado;

      const nuevoEstado =
        saldoRestante <= 0
          ? "pagada"
          : nuevoMontoPagado > 0
            ? "parcial"
            : "pendiente";

      await client.query(
        `UPDATE cuotas
                 SET monto_pagado = $1, estado = $2, updated_at = NOW()
                 WHERE id = $3`,
        [nuevoMontoPagado, nuevoEstado, cuota_id],
      );

      return {
        pagoId,
        montoRecibido: parseFloat(monto),
        desglose: {
          aplicadoMora: moraAplicada,
          aplicadoSaldo: saldoAplicado,
          excedente: montoPendiente,
          diasAtraso: mora.diasAtraso,
          moraTotal: mora.montoMora,
          moraPendiente: Math.max(0, mora.montoMora - moraAplicada),
          saldoRestante: saldoRestante,
          estadoCuota: nuevoEstado,
        },
        registroMora: registroMora, // Información del registro de mora
        mensaje: generarMensajePago(
          moraAplicada,
          saldoAplicado,
          mora,
          saldoRestante,
          registroMora,
        ),
      };
    });

    return res;
  } catch (error) {
    throw error;
  }
};
```

---

## 📈 Consultas Útiles

### 1. Ver historial de pagos de mora de una cuota:

```sql
SELECT
    pm.*,
    p.monto as monto_pago_total,
    p.fecha_pago,
    u.nombre as cobrador
FROM pagos_mora pm
JOIN pagos p ON p.id = pm.pago_id
JOIN usuarios u ON u.id = pm.usuario_id
WHERE pm.cuota_id = 123
ORDER BY pm.fecha_registro DESC;
```

### 2. Total de mora cobrada por préstamo:

```sql
SELECT
    c.prestamo_id,
    SUM(pm.monto_mora_pagado) as total_mora_cobrada,
    COUNT(DISTINCT pm.cuota_id) as cuotas_con_mora,
    AVG(pm.dias_atraso) as promedio_dias_atraso
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
WHERE c.prestamo_id = 456
GROUP BY c.prestamo_id;
```

### 3. Clientes con más mora pagada:

```sql
SELECT
    pr.cliente_id,
    cl.nombre,
    cl.apellido,
    SUM(pm.monto_mora_pagado) as total_mora_pagada,
    COUNT(DISTINCT c.prestamo_id) as prestamos_con_mora
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
JOIN prestamos pr ON pr.id = c.prestamo_id
JOIN clientes cl ON cl.id = pr.cliente_id
WHERE pr.empresa_id = 14
GROUP BY pr.cliente_id, cl.nombre, cl.apellido
ORDER BY total_mora_pagada DESC
LIMIT 10;
```

### 4. Mora pendiente actual por cuota:

```sql
-- Esta consulta combina mora ya pagada con mora actual
WITH mora_pagada AS (
    SELECT
        cuota_id,
        SUM(monto_mora_pagado) as total_pagado
    FROM pagos_mora
    GROUP BY cuota_id
)
SELECT
    c.id as cuota_id,
    c.prestamo_id,
    c.numero_cuota,
    c.fecha_pago,
    c.estado,
    COALESCE(mp.total_pagado, 0) as mora_ya_pagada,
    -- Aquí calcularías la mora actual dinámicamente
    CASE
        WHEN c.estado != 'pagada' THEN
            -- Lógica de cálculo de mora actual
            (c.monto - c.monto_pagado) * 0.005 *
            GREATEST(0, EXTRACT(DAY FROM CURRENT_DATE - c.fecha_pago))
        ELSE 0
    END as mora_actual_pendiente
FROM cuotas c
LEFT JOIN mora_pagada mp ON mp.cuota_id = c.id
WHERE c.prestamo_id = 789;
```

---

## 🎯 Funcionalidades Adicionales

### 1. Condonar mora:

```javascript
export const condonarMora = async (cuotaId, usuarioId, motivo) => {
  return await executeTransaction(async (client) => {
    // Obtener cuota
    const cuota = await client.query("SELECT * FROM cuotas WHERE id = $1", [
      cuotaId,
    ]);

    // Calcular mora actual
    const mora = calcularMora(cuota.rows[0], empresaConfig);

    if (mora.montoMora <= 0) {
      throw new Error("No hay mora para condonar");
    }

    // Registrar la condonación
    await registrarPagoMora(client, {
      cuota_id: cuotaId,
      pago_id: null, // No hay pago asociado
      usuario_id: usuarioId,
      dias_atraso: mora.diasAtraso,
      tasa_aplicada: mora.tasaDiaria,
      monto_mora_calculado: mora.montoMora,
      monto_mora_pagado: mora.montoMora, // Se "paga" toda la mora
      tipo_registro: "condonacion",
      notas: `Mora condonada. Motivo: ${motivo}`,
    });

    return {
      message: "Mora condonada exitosamente",
      montoCondonado: mora.montoMora,
    };
  });
};
```

### 2. Reporte de mora del día:

```javascript
export const reporteMoraDelDia = async (empresaId, fecha) => {
  const query = `
        SELECT 
            DATE(pm.fecha_registro) as fecha,
            COUNT(pm.id) as cantidad_pagos,
            SUM(pm.monto_mora_pagado) as total_mora_cobrada,
            COUNT(DISTINCT pm.cuota_id) as cuotas_afectadas,
            COUNT(CASE WHEN pm.es_pago_completo THEN 1 END) as cuotas_cerradas
        FROM pagos_mora pm
        JOIN cuotas c ON c.id = pm.cuota_id
        JOIN prestamos p ON p.id = c.prestamo_id
        WHERE p.empresa_id = $1
        AND DATE(pm.fecha_registro) = $2
        GROUP BY DATE(pm.fecha_registro)`;

  return await executeSelectOne(query, [empresaId, fecha]);
};
```

---

## ⚠️ Consideraciones Legales

1. **Transparencia:** Informar claramente al cliente sobre la mora antes del préstamo
2. **Límites:** Verificar legislación local sobre límites de mora
3. **Condonación:** Permitir condonar mora en casos especiales
4. **Documentación:** Mantener registro de toda mora aplicada ✅ (Ahora con tabla `pagos_mora`)

---

## 📝 Próximos Pasos

1. ✅ Decidir qué opción implementar (recomiendo Opción 1 para empezar)
2. ⬜ Migrar BD para agregar campos necesarios
3. ⬜ Implementar funciones de cálculo de mora
4. ⬜ Modificar servicios existentes
5. ⬜ Agregar endpoints de API necesarios
6. ⬜ Actualizar frontend para mostrar mora
7. ⬜ Probar con casos reales
8. ⬜ Documentar para el cliente

---

## 🤝 ¿Necesitas Ayuda?

Puedo ayudarte a implementar cualquiera de estas opciones. Solo dime:

1. ¿Qué opción prefieres?
2. ¿Qué tasa de mora quieres configurar por defecto?
3. ¿Quieres días de gracia?
