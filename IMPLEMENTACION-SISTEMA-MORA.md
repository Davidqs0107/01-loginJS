# Sistema de Mora/Interés Moratorio - Guía de Implementación

## 📋 Resumen Ejecutivo

Implementar un sistema completo de **mora o interés moratorio** con las siguientes características:

✅ **Cálculo Dinámico**: La mora se calcula en tiempo real  
✅ **Pagos Flexibles**: Acepta pagos parciales (mora primero, luego saldo)  
✅ **Historial Completo**: Registra cada pago de mora en tabla dedicada  
✅ **Configurable**: Cada empresa define su tasa y días de gracia

---

## 🎯 Solución Recomendada

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│  1. CONFIGURACIÓN (Tabla empresas)                  │
│     - Tasa de mora diaria                           │
│     - Días de gracia                                │
│     - Tipo: porcentaje o monto fijo                 │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  2. CÁLCULO DINÁMICO (Helper)                       │
│     - Calcula mora en tiempo real                   │
│     - Basado en días de atraso                      │
│     - No se guarda en BD (solo se calcula)          │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  3. APLICACIÓN DE PAGO (Estrategia Mora Primero)    │
│     - Pago se aplica PRIMERO a la mora              │
│     - Luego al saldo de la cuota                    │
│     - Acepta pagos parciales                        │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  4. REGISTRO HISTÓRICO (Tabla pagos_mora)           │
│     - Guarda cada pago de mora                      │
│     - Auditoría completa                            │
│     - Permite reportes y análisis                   │
└─────────────────────────────────────────────────────┘
```

---

## 🗄️ PASO 1: Modificaciones a la Base de Datos

### 1.1 Agregar campos de configuración a `empresas`

```sql
-- Agregar campos de configuración de mora a empresas
ALTER TABLE empresas
ADD COLUMN mora_tipo VARCHAR(20) DEFAULT 'porcentaje',
ADD COLUMN mora_tasa_diaria NUMERIC(5, 4) DEFAULT 0.0050,
ADD COLUMN mora_monto_fijo NUMERIC(10, 2) DEFAULT 5.00,
ADD COLUMN mora_dias_gracia INT DEFAULT 0;

-- Comentarios para documentar
COMMENT ON COLUMN empresas.mora_tipo IS 'Tipo de mora: porcentaje o monto_fijo';
COMMENT ON COLUMN empresas.mora_tasa_diaria IS 'Tasa diaria de mora cuando es porcentual (ej: 0.0050 = 0.5%)';
COMMENT ON COLUMN empresas.mora_monto_fijo IS 'Monto fijo por día cuando mora_tipo = monto_fijo';
COMMENT ON COLUMN empresas.mora_dias_gracia IS 'Días de gracia antes de empezar a cobrar mora';
```

### 1.2 Crear tabla `pagos_mora` para historial

```sql
-- Tabla para registrar historial de pagos de mora
CREATE TABLE pagos_mora (
    id BIGSERIAL PRIMARY KEY,
    cuota_id BIGINT NOT NULL REFERENCES cuotas(id) ON DELETE CASCADE,
    pago_id BIGINT NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id),

    -- Información de la mora en el momento del pago
    dias_atraso INT NOT NULL,
    tasa_aplicada NUMERIC(5, 4), -- Tasa diaria aplicada
    monto_mora_calculado NUMERIC(15, 2) NOT NULL, -- Mora total en ese momento
    monto_mora_pagado NUMERIC(15, 2) NOT NULL, -- Cuánto se pagó de mora

    -- Estado y tipo
    tipo_registro VARCHAR(20) DEFAULT 'pago', -- 'pago', 'condonacion', 'ajuste'
    es_pago_completo BOOLEAN DEFAULT false, -- true si pagó toda la mora

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

-- Comentarios
COMMENT ON TABLE pagos_mora IS 'Historial de pagos de mora realizados';
COMMENT ON COLUMN pagos_mora.monto_mora_calculado IS 'Monto total de mora acumulada al momento del pago';
COMMENT ON COLUMN pagos_mora.monto_mora_pagado IS 'Monto que se aplicó a mora en este pago específico';
COMMENT ON COLUMN pagos_mora.es_pago_completo IS 'Indica si este pago liquidó completamente la mora de la cuota';
```

### 1.3 Vista para resumen de mora por cuota

```sql
-- Vista para facilitar consultas de mora
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
    BOOL_OR(pm.es_pago_completo) as mora_completamente_pagada
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
GROUP BY pm.cuota_id, c.numero_cuota, c.prestamo_id;

COMMENT ON VIEW v_resumen_pagos_mora IS 'Resumen de pagos de mora agrupados por cuota';
```

---

## 💻 PASO 2: Implementación del Código

### 2.1 Helper para calcular mora (`src/helpers/moraCalculator.js`)

```javascript
import moment from "moment";

/**
 * Calcula la mora de una cuota basándose en días de atraso
 * @param {Object} cuota - Cuota con fecha_pago, monto, monto_pagado, estado
 * @param {Object} empresaConfig - Configuración de mora de la empresa
 * @returns {Object} Información detallada de la mora
 */
export const calcularMora = (cuota, empresaConfig) => {
  const { fecha_pago, monto, monto_pagado, estado } = cuota;
  const {
    mora_tipo = "porcentaje",
    mora_tasa_diaria = 0.005, // 0.5% por día por defecto
    mora_monto_fijo = 5.0,
    mora_dias_gracia = 0,
  } = empresaConfig;

  // Si la cuota está pagada, no hay mora
  if (estado === "pagada") {
    return {
      diasAtraso: 0,
      montoMora: 0,
      montoTotal: parseFloat(monto),
      saldoSinMora: 0,
      aplicaMora: false,
    };
  }

  // Calcular días de atraso
  const fechaLimite = moment.utc(fecha_pago).startOf("day");
  const fechaHoy = moment.utc().startOf("day");

  const diasAtraso = fechaHoy.diff(fechaLimite, "days");
  const diasAtrasoReal = Math.max(0, diasAtraso - mora_dias_gracia);

  // Si no hay atraso, no hay mora
  if (diasAtrasoReal <= 0) {
    const saldoPendiente = parseFloat(monto) - parseFloat(monto_pagado || 0);
    return {
      diasAtraso: 0,
      montoMora: 0,
      montoTotal: saldoPendiente,
      saldoSinMora: saldoPendiente,
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
    tipoMora: mora_tipo,
  };
};
```

### 2.2 Helper para registrar pagos de mora (`src/helpers/registrarPagoMora.js`)

```javascript
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

  if (monto_mora_pagado > monto_mora_calculado + 0.01) {
    // Tolerancia de 1 centavo
    throw new Error("El monto pagado no puede ser mayor a la mora calculada");
  }

  // Determinar si es pago completo (con tolerancia de 1 centavo)
  const tolerancia = 0.01;
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
    mora_restante: monto_mora_calculado - monto_mora_pagado,
    mensaje: es_pago_completo
      ? "✅ Mora pagada completamente"
      : `⚠️ Pago parcial de mora. Quedan $${(monto_mora_calculado - monto_mora_pagado).toFixed(2)}`,
  };
};
```

### 2.3 Servicio de pagos con mora (`src/services/pagosServices.js`)

```javascript
import { calcularMora } from "../helpers/moraCalculator.js";
import { registrarPagoMora } from "../helpers/registrarPagoMora.js";
import { executeTransaction } from "../helpers/transactionSql.js";

/**
 * Crea un pago aplicando la estrategia "Mora Primero"
 * - El pago se aplica primero a la mora
 * - El resto se aplica al saldo de la cuota
 * - Acepta pagos parciales con validaciones
 */
export const crearPagoConMora = async (data) => {
  const { cuota_id, usuario_id, monto, fecha_pago, tipo_pago, empresa_id } =
    data;

  try {
    const res = await executeTransaction(async (client) => {
      // 1. Obtener cuota con configuración de mora de la empresa
      const cuotaQuery = `
                SELECT c.*, 
                       e.mora_tipo, 
                       e.mora_tasa_diaria, 
                       e.mora_monto_fijo, 
                       e.mora_dias_gracia,
                       p.empresa_id
                FROM cuotas c
                JOIN prestamos p ON p.id = c.prestamo_id
                JOIN empresas e ON e.id = p.empresa_id
                WHERE c.id = $1 AND p.empresa_id = $2`;

      const cuotaResult = await client.query(cuotaQuery, [
        cuota_id,
        empresa_id,
      ]);

      if (cuotaResult.rowCount === 0) {
        throw new Error("No se encontró la cuota especificada.");
      }

      const cuota = cuotaResult.rows[0];

      // 2. Calcular mora actual
      const mora = calcularMora(cuota, {
        mora_tipo: cuota.mora_tipo,
        mora_tasa_diaria: cuota.mora_tasa_diaria,
        mora_monto_fijo: cuota.mora_monto_fijo,
        mora_dias_gracia: cuota.mora_dias_gracia,
      });

      // 3. Validaciones
      const MONTO_MINIMO_PORCENTAJE = 0.1; // 10% del total
      const MORA_CRITICA_PORCENTAJE = 20; // 20%

      const montoMinimo = mora.montoTotal * MONTO_MINIMO_PORCENTAJE;
      const porcentajeMora =
        mora.saldoSinMora > 0 ? (mora.montoMora / mora.saldoSinMora) * 100 : 0;

      // Validación 1: Monto mínimo
      if (monto < montoMinimo) {
        throw new Error(
          `El monto debe ser al menos $${montoMinimo.toFixed(2)} ` +
            `(10% del total adeudado: $${mora.montoTotal.toFixed(2)})`,
        );
      }

      // Validación 2: Si la mora es crítica, debe pagar la mora completa
      if (
        mora.aplicaMora &&
        porcentajeMora >= MORA_CRITICA_PORCENTAJE &&
        monto < mora.montoMora
      ) {
        throw new Error(
          `⚠️ MORA CRÍTICA: La mora ha alcanzado el ${porcentajeMora.toFixed(1)}% del saldo.\n` +
            `Debe pagar primero la mora completa: $${mora.montoMora.toFixed(2)}\n` +
            `Monto recibido: $${monto.toFixed(2)}\n` +
            `Faltante: $${(mora.montoMora - monto).toFixed(2)}`,
        );
      }

      // 4. Aplicar pago usando Estrategia "Mora Primero"
      let montoPendiente = parseFloat(monto);
      let moraAplicada = 0;
      let saldoAplicado = 0;

      // Paso 4.1: Aplicar a MORA primero
      if (mora.aplicaMora && mora.montoMora > 0) {
        moraAplicada = Math.min(montoPendiente, mora.montoMora);
        montoPendiente -= moraAplicada;
      }

      // Paso 4.2: Aplicar resto al SALDO de la cuota
      if (montoPendiente > 0 && mora.saldoSinMora > 0) {
        saldoAplicado = Math.min(montoPendiente, mora.saldoSinMora);
        montoPendiente -= saldoAplicado;
      }

      // 5. Insertar el pago en tabla pagos
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

      // 6. Registrar pago de mora en tabla pagos_mora (si hubo)
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
          notas: `Pago de mora. ${mora.diasAtraso} días de atraso. Tipo: ${mora.tipoMora}`,
        });
      }

      // 7. Actualizar cuota
      const nuevoMontoPagado =
        parseFloat(cuota.monto_pagado || 0) + saldoAplicado;
      const saldoRestante = parseFloat(cuota.monto) - nuevoMontoPagado;

      // Determinar nuevo estado
      let nuevoEstado;
      if (saldoRestante <= 0.01) {
        // Tolerancia de 1 centavo
        nuevoEstado = "pagada";
      } else if (nuevoMontoPagado > 0) {
        nuevoEstado = "parcial";
      } else {
        nuevoEstado = "pendiente";
      }

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

      // 8. Generar respuesta detallada
      const moraPendiente = Math.max(0, mora.montoMora - moraAplicada);

      return {
        pagoId,
        montoRecibido: parseFloat(monto),
        desglose: {
          aplicadoMora: moraAplicada,
          aplicadoSaldo: saldoAplicado,
          excedente: montoPendiente,
          diasAtraso: mora.diasAtraso,
          moraTotal: mora.montoMora,
          moraPendiente: moraPendiente,
          saldoRestante: Math.max(0, saldoRestante),
          estadoCuota: nuevoEstado,
          porcentajeMora: porcentajeMora.toFixed(2),
        },
        registroMora: registroMora,
        mensaje: generarMensajePago(
          moraAplicada,
          saldoAplicado,
          mora,
          saldoRestante,
          moraPendiente,
        ),
      };
    });

    return res;
  } catch (error) {
    throw error;
  }
};

/**
 * Genera un mensaje descriptivo del resultado del pago
 */
const generarMensajePago = (
  moraAplicada,
  saldoAplicado,
  mora,
  saldoRestante,
  moraPendiente,
) => {
  let mensaje = "✅ Pago procesado exitosamente.\n\n";

  mensaje += "📊 DESGLOSE DEL PAGO:\n";
  mensaje += "─────────────────────\n";

  if (moraAplicada > 0) {
    mensaje += `✓ Mora pagada: $${moraAplicada.toFixed(2)}`;
    if (mora.diasAtraso > 0) {
      mensaje += ` (${mora.diasAtraso} días de atraso)`;
    }
    mensaje += "\n";
  }

  if (saldoAplicado > 0) {
    mensaje += `✓ Abono a cuota: $${saldoAplicado.toFixed(2)}\n`;
  }

  mensaje += "\n📈 ESTADO ACTUAL:\n";
  mensaje += "─────────────────────\n";

  if (moraPendiente > 0) {
    mensaje += `⚠️ Mora pendiente: $${moraPendiente.toFixed(2)}\n`;
  }

  if (saldoRestante > 0.01) {
    mensaje += `⚠️ Saldo pendiente: $${saldoRestante.toFixed(2)}\n`;
    if (moraPendiente === 0) {
      mensaje += "\n⚡ IMPORTANTE: Si no paga el saldo completo, ";
      mensaje += "la mora seguirá acumulándose sobre el saldo restante.";
    }
  } else {
    mensaje += "🎉 ¡Cuota pagada completamente!";
  }

  return mensaje;
};
```

### 2.4 Modificar servicio de cuotas para incluir mora

```javascript
// En src/services/cuotaServices.js

import { calcularMora } from "../helpers/moraCalculator.js";
import { executeSelect, executeSelectOne } from "../helpers/queryS.js";

/**
 * Obtiene cuotas de un préstamo incluyendo cálculo de mora
 */
export const getCuotasByPrestamoIdConMora = async (data) => {
  const { page, pageSize, prestamo_id, empresa_id } = data;

  try {
    // Obtener configuración de mora de la empresa
    const empresaConfigResult = await executeSelectOne(
      `SELECT mora_tipo, mora_tasa_diaria, mora_monto_fijo, mora_dias_gracia 
             FROM empresas WHERE id = $1`,
      [empresa_id],
    );

    const empresaConfig = empresaConfigResult[0] || {};

    // Obtener cuotas
    const cuotasResult = await executeSelect(
      `SELECT c.*, p.cliente_id, p.usuario_id, p.empresa_id
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
      const mora = calcularMora(cuota, empresaConfig);
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

---

## 📊 PASO 3: Endpoints de API

### 3.1 Crear endpoint para pago con mora

```javascript
// En src/controllers/pagosController.js

import { crearPagoConMora } from "../services/pagosServices.js";

export const crearPago = async (req, res) => {
  const { cuota_id, monto, fecha_pago, tipo_pago } = req.body;
  const usuario_id = req.id; // Desde middleware de autenticación
  const empresa_id = req.empresa_id; // Desde middleware de autenticación

  try {
    const resultado = await crearPagoConMora({
      cuota_id,
      usuario_id,
      monto,
      fecha_pago: fecha_pago || new Date(),
      tipo_pago: tipo_pago || "efectivo",
      empresa_id,
    });

    return res.status(201).json({
      ok: true,
      msg: "Pago registrado exitosamente",
      pago: resultado,
    });
  } catch (error) {
    console.error("Error en crearPago:", error);
    return res.status(400).json({
      ok: false,
      msg: error.message,
    });
  }
};
```

### 3.2 Endpoint para obtener cuotas con mora

```javascript
// En src/controllers/cuotasController.js

import { getCuotasByPrestamoIdConMora } from "../services/cuotaServices.js";

export const getCuotasByPrestamoId = async (req, res) => {
  const { prestamo_id } = req.params;
  const { page = 1, pageSize = 100 } = req.query;
  const empresa_id = req.empresa_id;

  try {
    const result = await getCuotasByPrestamoIdConMora({
      page,
      pageSize,
      prestamo_id,
      empresa_id,
    });

    return res.status(200).json({
      ok: true,
      cuotas: result.data,
      meta: result.meta,
    });
  } catch (error) {
    console.error("Error en getCuotasByPrestamoId:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error al obtener las cuotas.",
    });
  }
};
```

### 3.3 Endpoint para historial de pagos de mora

```javascript
// En src/controllers/pagosController.js

export const getHistorialMoraCuota = async (req, res) => {
  const { cuota_id } = req.params;
  const empresa_id = req.empresa_id;

  try {
    const query = `
            SELECT pm.*, 
                   p.monto as monto_pago_total,
                   p.fecha_pago,
                   u.nombre as cobrador_nombre
            FROM pagos_mora pm
            JOIN pagos p ON p.id = pm.pago_id
            JOIN usuarios u ON u.id = pm.usuario_id
            JOIN cuotas c ON c.id = pm.cuota_id
            JOIN prestamos pr ON pr.id = c.prestamo_id
            WHERE pm.cuota_id = $1 AND pr.empresa_id = $2
            ORDER BY pm.fecha_registro DESC`;

    const result = await executeSelectOne(query, [cuota_id, empresa_id]);

    return res.status(200).json({
      ok: true,
      historial: result,
    });
  } catch (error) {
    console.error("Error en getHistorialMoraCuota:", error);
    return res.status(500).json({
      ok: false,
      msg: "Error al obtener el historial de mora.",
    });
  }
};
```

---

## 🎨 PASO 4: Interfaz de Usuario (Frontend)

### 4.1 Mostrar cuota con mora

```javascript
// Ejemplo de estructura de datos que recibe el frontend
{
    "id": 123,
    "numero_cuota": 1,
    "fecha_pago": "2026-01-20",
    "monto": 100.00,
    "monto_pagado": 0.00,
    "estado": "pendiente",
    "mora": {
        "aplicaMora": true,
        "diasAtraso": 9,
        "montoMora": 4.50,
        "saldoSinMora": 100.00,
        "montoTotal": 104.50,
        "tipoMora": "porcentaje",
        "tasaDiaria": 0.005
    }
}
```

### 4.2 Componente para mostrar cuota (React/Vue ejemplo)

```jsx
function CuotaCard({ cuota }) {
  const { mora } = cuota;
  const tieneMora = mora.aplicaMora && mora.montoMora > 0;

  return (
    <div className={`cuota-card ${tieneMora ? "con-mora" : ""}`}>
      <div className="cuota-header">
        <h3>Cuota #{cuota.numero_cuota}</h3>
        <span className={`estado ${cuota.estado}`}>{cuota.estado}</span>
      </div>

      <div className="cuota-detalles">
        <div className="detalle-item">
          <label>Fecha de pago:</label>
          <span>{formatearFecha(cuota.fecha_pago)}</span>
        </div>

        <div className="detalle-item">
          <label>Monto original:</label>
          <span>${cuota.monto.toFixed(2)}</span>
        </div>

        <div className="detalle-item">
          <label>Ya pagado:</label>
          <span>${cuota.monto_pagado.toFixed(2)}</span>
        </div>

        <div className="detalle-item">
          <label>Saldo pendiente:</label>
          <span>${mora.saldoSinMora.toFixed(2)}</span>
        </div>

        {tieneMora && (
          <div className="mora-alerta">
            <div className="alerta-header">⚠️ CUOTA VENCIDA</div>
            <div className="detalle-item mora">
              <label>Días de atraso:</label>
              <span className="destacado">{mora.diasAtraso} días</span>
            </div>
            <div className="detalle-item mora">
              <label>Mora acumulada:</label>
              <span className="destacado rojo">
                ${mora.montoMora.toFixed(2)}
              </span>
            </div>
            <div className="separador"></div>
            <div className="detalle-item total">
              <label>
                <strong>TOTAL A PAGAR:</strong>
              </label>
              <span className="total-amount">
                ${mora.montoTotal.toFixed(2)}
              </span>
            </div>
            <div className="monto-minimo">
              <small>
                * Monto mínimo: ${(mora.montoTotal * 0.1).toFixed(2)}
              </small>
            </div>
          </div>
        )}
      </div>

      {cuota.estado !== "pagada" && (
        <div className="cuota-acciones">
          <button className="btn-pagar" onClick={() => abrirModalPago(cuota)}>
            💰 Registrar Pago
          </button>
        </div>
      )}
    </div>
  );
}
```

### 4.3 Estilos CSS sugeridos

```css
.cuota-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.cuota-card.con-mora {
  border-color: #ff6b6b;
  background-color: #fff5f5;
}

.mora-alerta {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
}

.alerta-header {
  font-weight: bold;
  color: #856404;
  margin-bottom: 8px;
}

.detalle-item.mora {
  padding: 4px 0;
}

.destacado {
  font-weight: bold;
}

.destacado.rojo {
  color: #dc3545;
}

.total-amount {
  font-size: 1.5em;
  font-weight: bold;
  color: #28a745;
}

.monto-minimo {
  margin-top: 8px;
  color: #666;
  font-style: italic;
}
```

---

## 🔍 PASO 5: Consultas y Reportes Útiles

### 5.1 Total de mora cobrada por empresa (mes actual)

```sql
SELECT
    SUM(pm.monto_mora_pagado) as total_mora_mes,
    COUNT(DISTINCT pm.cuota_id) as cuotas_con_mora,
    COUNT(pm.id) as cantidad_pagos_mora,
    AVG(pm.dias_atraso) as promedio_dias_atraso
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
JOIN prestamos p ON p.id = c.prestamo_id
WHERE p.empresa_id = $1
AND EXTRACT(MONTH FROM pm.fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE)
AND EXTRACT(YEAR FROM pm.fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE);
```

### 5.2 Top clientes con más mora pagada

```sql
SELECT
    pr.cliente_id,
    cl.nombre || ' ' || cl.apellido as cliente,
    cl.telefono,
    SUM(pm.monto_mora_pagado) as total_mora_pagada,
    COUNT(DISTINCT c.id) as cuotas_con_mora,
    COUNT(DISTINCT c.prestamo_id) as prestamos_afectados,
    AVG(pm.dias_atraso) as promedio_atraso
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
JOIN prestamos pr ON pr.id = c.prestamo_id
JOIN clientes cl ON cl.id = pr.cliente_id
WHERE pr.empresa_id = $1
GROUP BY pr.cliente_id, cl.nombre, cl.apellido, cl.telefono
ORDER BY total_mora_pagada DESC
LIMIT 10;
```

### 5.3 Cuotas con mora pendiente actual

```sql
SELECT
    c.id as cuota_id,
    c.numero_cuota,
    c.prestamo_id,
    pr.cliente_id,
    cl.nombre || ' ' || cl.apellido as cliente,
    c.fecha_pago,
    c.monto,
    c.monto_pagado,
    (c.monto - c.monto_pagado) as saldo_pendiente,
    CURRENT_DATE - c.fecha_pago as dias_vencido,
    -- Mora ya pagada anteriormente
    COALESCE(
        (SELECT SUM(monto_mora_pagado)
         FROM pagos_mora
         WHERE cuota_id = c.id),
        0
    ) as mora_ya_pagada
FROM cuotas c
JOIN prestamos pr ON pr.id = c.prestamo_id
JOIN clientes cl ON cl.id = pr.cliente_id
WHERE pr.empresa_id = $1
AND c.estado IN ('pendiente', 'parcial')
AND c.fecha_pago < CURRENT_DATE
ORDER BY dias_vencido DESC;
```

### 5.4 Reporte diario de mora

```sql
-- Mora cobrada en una fecha específica
SELECT
    DATE(pm.fecha_registro) as fecha,
    COUNT(pm.id) as pagos_realizados,
    SUM(pm.monto_mora_pagado) as total_cobrado,
    COUNT(DISTINCT pm.cuota_id) as cuotas_afectadas,
    COUNT(CASE WHEN pm.es_pago_completo THEN 1 END) as cuotas_cerradas,
    AVG(pm.dias_atraso) as promedio_dias_atraso
FROM pagos_mora pm
JOIN cuotas c ON c.id = pm.cuota_id
JOIN prestamos p ON p.id = c.prestamo_id
WHERE p.empresa_id = $1
AND DATE(pm.fecha_registro) = $2
GROUP BY DATE(pm.fecha_registro);
```

---

## 🧪 PASO 6: Pruebas y Casos de Uso

### Caso 1: Pago completo (saldo + mora)

```javascript
// Cliente debe: $100 saldo + $10 mora = $110 total
// Paga: $110
await crearPagoConMora({
  cuota_id: 123,
  monto: 110,
  usuario_id: 1,
  empresa_id: 14,
  fecha_pago: new Date(),
  tipo_pago: "efectivo",
});

// Resultado esperado:
// - $10 aplicado a mora ✅
// - $100 aplicado a saldo ✅
// - Cuota estado = 'pagada' ✅
// - Registro en pagos_mora con es_pago_completo = true ✅
```

### Caso 2: Pago parcial (solo mora)

```javascript
// Cliente debe: $100 saldo + $10 mora = $110 total
// Paga: $10
await crearPagoConMora({
  cuota_id: 123,
  monto: 10,
  usuario_id: 1,
  empresa_id: 14,
  fecha_pago: new Date(),
  tipo_pago: "efectivo",
});

// Resultado esperado:
// - $10 aplicado a mora ✅
// - $0 aplicado a saldo
// - Cuota estado = 'pendiente' (sin cambios)
// - Registro en pagos_mora con es_pago_completo = true ✅
// - Saldo sigue generando mora ⚠️
```

### Caso 3: Pago parcial (mora + parte del saldo)

```javascript
// Cliente debe: $100 saldo + $10 mora = $110 total
// Paga: $50
await crearPagoConMora({
  cuota_id: 123,
  monto: 50,
  usuario_id: 1,
  empresa_id: 14,
  fecha_pago: new Date(),
  tipo_pago: "transferencia",
});

// Resultado esperado:
// - $10 aplicado a mora ✅
// - $40 aplicado a saldo ✅
// - Cuota estado = 'parcial' ✅
// - Registro en pagos_mora con es_pago_completo = true ✅
// - Saldo restante ($60) sigue generando mora ⚠️
```

### Caso 4: Mora crítica (debe pagar mora completa)

```javascript
// Cliente debe: $100 saldo + $25 mora (25% del saldo) = $125 total
// Intenta pagar: $20 (menos que la mora)
try {
  await crearPagoConMora({
    cuota_id: 123,
    monto: 20,
    usuario_id: 1,
    empresa_id: 14,
    fecha_pago: new Date(),
    tipo_pago: "efectivo",
  });
} catch (error) {
  // Error esperado:
  // "⚠️ MORA CRÍTICA: La mora ha alcanzado el 25.0% del saldo.
  //  Debe pagar primero la mora completa: $25.00
  //  Monto recibido: $20.00
  //  Faltante: $5.00"
}
```

---

## ⚙️ PASO 7: Configuración Inicial

### 7.1 Configurar mora para una empresa

```sql
-- Ejemplo: Empresa con mora del 0.5% diario con 2 días de gracia
UPDATE empresas
SET mora_tipo = 'porcentaje',
    mora_tasa_diaria = 0.005,
    mora_dias_gracia = 2
WHERE id = 14;

-- Ejemplo: Empresa con mora fija de $5 por día sin gracia
UPDATE empresas
SET mora_tipo = 'monto_fijo',
    mora_monto_fijo = 5.00,
    mora_dias_gracia = 0
WHERE id = 15;
```

### 7.2 Tasas de mora recomendadas

| Tipo         | Valor       | Descripción             | Equivalente Mensual |
| ------------ | ----------- | ----------------------- | ------------------- |
| Conservadora | 0.1% diario | Para clientes buenos    | ~3% mensual         |
| Moderada     | 0.5% diario | **Recomendada**         | ~15% mensual        |
| Agresiva     | 1.0% diario | Para casos especiales   | ~30% mensual        |
| Monto Fijo   | $5/día      | Para préstamos pequeños | Varía según monto   |

---

## ✅ Checklist de Implementación

### Base de Datos

- [ ] Agregar campos de mora a tabla `empresas`
- [ ] Crear tabla `pagos_mora`
- [ ] Crear índices en `pagos_mora`
- [ ] Crear vista `v_resumen_pagos_mora`
- [ ] Configurar mora inicial para empresas existentes

### Backend

- [ ] Crear `src/helpers/moraCalculator.js`
- [ ] Crear `src/helpers/registrarPagoMora.js`
- [ ] Modificar `src/services/pagosServices.js`
- [ ] Modificar `src/services/cuotaServices.js`
- [ ] Crear/actualizar endpoints en controllers
- [ ] Agregar rutas de API

### Frontend

- [ ] Actualizar componente de cuotas para mostrar mora
- [ ] Actualizar formulario de pago con validaciones
- [ ] Crear vista de historial de mora
- [ ] Agregar estilos para alertas de mora
- [ ] Agregar reportes de mora

### Pruebas

- [ ] Probar cálculo de mora con diferentes configuraciones
- [ ] Probar pago completo
- [ ] Probar pagos parciales
- [ ] Probar validación de mora crítica
- [ ] Probar validación de monto mínimo
- [ ] Verificar registros en `pagos_mora`

### Documentación

- [ ] Documentar API endpoints
- [ ] Crear manual de usuario
- [ ] Documentar configuración de mora por empresa
- [ ] Crear guía de reportes

---

## 🚀 Próximos Pasos Después de la Implementación

1. **Monitoreo**: Crear dashboard para visualizar mora cobrada
2. **Notificaciones**: Alertas automáticas de cuotas vencidas
3. **Condonación**: Funcionalidad para condonar mora en casos especiales
4. **Reportes avanzados**: Análisis de comportamiento de pago
5. **Optimización**: Ajustar tasas según comportamiento histórico

---

## 📞 Soporte

Si necesitas ayuda con la implementación:

1. Revisa los ejemplos de código
2. Verifica que todas las dependencias estén instaladas
3. Prueba con casos simples primero
4. Consulta los logs para detectar errores

**¿Listo para empezar? Solo dime y te ayudo paso a paso.** 🚀
