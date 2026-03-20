# Propuesta de Desarrollo — Módulo de Préstamos Grupales

**Fecha:** 18 de marzo de 2026  
**Versión:** 1.0  
**Estado:** Propuesta inicial

---

## Descripción General

El módulo de **Préstamos Grupales** permite gestionar créditos otorgados colectivamente a un grupo de personas, donde cada integrante recibe un monto variable del total del grupo. El sistema incorpora un ahorro del 10% por integrante, cobros cada 2 semanas y un sistema de reportes de seguimiento grupal con alertas en tiempo real.

---

## Problemática que Resuelve

Actualmente el sistema gestiona préstamos individuales. Los clientes que trabajan con grupos de personas (comunidades, asociaciones, grupos de mercado) necesitan:

- Agrupar préstamos bajo un mismo identificador de grupo
- Visualizar de forma rápida quién pagó y quién no dentro del grupo
- Generar reportes de cobro por fecha para cada grupo
- Controlar el ahorro acumulado por integrante

---

## Alcance del Módulo

### 1. Gestión de Grupos

- Crear, editar y desactivar grupos de préstamo
- Asignar nombre descriptivo al grupo (ej. "Grupo Mercado Central")
- Definir monto total del grupo
- Configurar porcentaje de ahorro por integrante (default 10%)
- Establecer frecuencia de cobro (quincenal — cada 2 semanas)
- Listar grupos con su estado: activo, completado, cancelado

### 2. Integrantes y Préstamos del Grupo

- Asociar múltiples clientes (integrantes) a un grupo
- Cada integrante recibe un monto variable del total del grupo
- El sistema valida que la suma de montos no exceda el total del grupo
- Vista completa de integrantes con sus montos y estado de préstamo
- Control individual del estado de cada integrante

### 3. Cobros Quincenales

- Cuotas generadas automáticamente cada 2 semanas por integrante
- Registro de pago individual dentro del grupo
- Control de pagos parciales
- Alertas visuales por estado de pago:
  - ✅ **Pagado** — pagó completo en tiempo
  - ⚠️ **Pago Parcial** — pagó pero incompleto
  - ⏳ **Pendiente** — aún dentro del plazo
  - 🚨 **Vencido** — no pagó y ya venció

### 4. Reportes por Grupo

- Reporte de pagos filtrado por rango de fechas
- Visualización de quién pagó y quién no en cada quincena
- Resumen del monto total cobrado vs. esperado por grupo
- Historial completo de todos los cobros del grupo
- Exportación del reporte a **PDF** y **Excel**

---

## Flujo del Negocio

```
Grupo "Mercado Central"  →  Monto total: $10,000
├── Ana López            →  Préstamo: $3,000  (ahorro 10% = $300)
├── Juan Pérez           →  Préstamo: $2,500  (ahorro 10% = $250)
├── María Torres         →  Préstamo: $2,000  (ahorro 10% = $200)
└── Pedro Ruiz           →  Préstamo: $2,500  (ahorro 10% = $250)
         ↓
   Cada integrante tiene sus propias cuotas quincenales
         ↓
   Cada 2 semanas se registra el cobro por integrante
         ↓
   El reporte muestra rápidamente quién pagó ✅ y quién no 🚨
```

---

## Pantallas del Sistema

### Pantalla 1 — Lista de Grupos
Tarjetas con:
- Nombre del grupo
- Monto total del grupo
- Número de integrantes
- Estado del grupo
- Barra de progreso de cobro

### Pantalla 2 — Detalle del Grupo
- Información general del grupo
- Tabla de integrantes con monto asignado y estado
- Resumen financiero: cobrado vs. pendiente

### Pantalla 3 — Cobro Quincenal
- Lista de todos los integrantes del grupo
- Estado de cobro actual de cada uno con alertas de color
- Botón para registrar pago individual
- Acceso al historial de pagos anteriores

### Pantalla 4 — Reporte de Pagos
- Filtro por grupo y rango de fechas
- Tabla de pagos agrupados por quincena
- Resumen de totales
- Botones: Exportar PDF / Exportar Excel

---

## Endpoints de la API

| Método   | Endpoint                          | Descripción                              |
|----------|-----------------------------------|------------------------------------------|
| `GET`    | `/api/grupos`                     | Listar todos los grupos                  |
| `POST`   | `/api/grupos`                     | Crear un nuevo grupo                     |
| `GET`    | `/api/grupos/:id`                 | Ver detalle de un grupo                  |
| `PUT`    | `/api/grupos/:id`                 | Editar un grupo                          |
| `DELETE` | `/api/grupos/:id`                 | Desactivar un grupo                      |
| `GET`    | `/api/grupos/:id/integrantes`     | Ver integrantes y sus préstamos          |
| `POST`   | `/api/grupos/:id/prestamos`       | Asociar préstamo de un integrante        |
| `GET`    | `/api/grupos/:id/reporte`         | Reporte de pagos con filtro de fecha     |
| `GET`    | `/api/grupos/:id/resumen`         | Resumen financiero del grupo             |

---

## Cambios en la Base de Datos

Los cambios son **no destructivos** — no se modifica ni elimina ningún dato existente.

1. **Nueva tabla** `grupos_prestamo` — almacena la información de cada grupo
2. **Nueva columna** `grupo_id` en la tabla `prestamos` como campo opcional (`NULL`)
   - Los préstamos individuales existentes quedan con `grupo_id = NULL` sin ningún cambio
   - Solo los nuevos préstamos grupales tendrán este campo asignado

---

## Plan de Desarrollo — 3 Semanas

### Semana 1 — Base de Datos y API Core
| Día | Tarea |
|-----|-------|
| 1 - 2 | Migración de base de datos (nueva tabla + columna) |
| 3 - 4 | API: CRUD de grupos (crear, listar, editar, desactivar) |
| 5 | API: Asociar préstamos al grupo con validación de montos |
| 6 - 7 | API: Registro de pagos por integrante y generación de cuotas |

### Semana 2 — Reportes y Lógica de Alertas
| Día | Tarea |
|-----|-------|
| 8 - 9 | API: Reporte de pagos por grupo con filtro de fecha |
| 10 | Lógica de alertas: vencidos, parciales, pendientes |
| 11 - 12 | API: Resumen financiero y ahorro acumulado del grupo |
| 13 - 14 | Validaciones, manejo de errores y pruebas completas de API |

### Semana 3 — Interfaz de Usuario
| Día | Tarea |
|-----|-------|
| 15 - 16 | UI: Formulario crear y editar grupo |
| 17 - 18 | UI: Vista de integrantes del grupo y sus préstamos |
| 19 - 20 | UI: Pantalla de cobro quincenal con alertas por estado |
| 21 | UI: Reporte visual con filtros de fecha y exportación |

---

## Entregables

Al finalizar las 3 semanas se entregará:

1. **Script SQL** de migración de base de datos (seguro, reversible)
2. **Módulo backend** completo con todos los endpoints funcionales
3. **Interfaz de usuario** integrada al sistema actual
4. **Reporte exportable** de pagos por grupo (PDF y Excel)
5. **Manual de uso** del módulo

---

## Tecnología Utilizada

| Capa | Tecnología |
|------|------------|
| Backend | Node.js + Express |
| Base de Datos | PostgreSQL |
| Frontend | Integrado al sistema actual |
| Exportación | pdfkit / exceljs |

---

## Notas Importantes

> - El módulo se integra al sistema existente sin afectar los préstamos individuales ya creados.
> - Los datos actuales de la base de datos permanecen intactos.
> - El porcentaje de ahorro (10%) es configurable por grupo.
> - La frecuencia de cobro quincenal puede ajustarse si el cliente lo requiere.

---

*Cualquier ajuste en el alcance o funcionalidades puede coordinarse antes del inicio del desarrollo.*
