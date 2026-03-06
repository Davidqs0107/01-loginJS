-- Script de migración para agregar tabla de notificaciones
-- Ejecutar este script en una base de datos existente

-- Crear secuencia si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'notificaciones_enviadas_id_seq') THEN
        CREATE SEQUENCE notificaciones_enviadas_id_seq
            INCREMENT BY 1
            MINVALUE 1
            MAXVALUE 9223372036854775807
            START 1
            CACHE 1
            NO CYCLE;
    END IF;
END $$;

-- Crear tabla notificaciones_enviadas
CREATE TABLE IF NOT EXISTS notificaciones_enviadas (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	cuota_id int8 NOT NULL,
	cliente_id int8 NOT NULL,
	tipo varchar(20) NOT NULL,
	destinatario text NOT NULL,
	estado varchar(20) DEFAULT 'enviado'::character varying NULL,
	mensaje text NULL,
	error_mensaje text NULL,
	fecha_envio timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT notificaciones_enviadas_pkey PRIMARY KEY (id),
	CONSTRAINT notificaciones_enviadas_tipo_check CHECK ((tipo = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text]))),
	CONSTRAINT notificaciones_enviadas_estado_check CHECK ((estado = ANY (ARRAY['enviado'::text, 'fallido'::text, 'pendiente'::text]))),
	CONSTRAINT notificaciones_enviadas_cuota_id_fkey FOREIGN KEY (cuota_id) REFERENCES cuotas(id) ON DELETE CASCADE,
	CONSTRAINT notificaciones_enviadas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- Crear índices para optimizar las consultas
CREATE INDEX IF NOT EXISTS notificaciones_cuota_idx ON public.notificaciones_enviadas USING btree (cuota_id, tipo, estado);
CREATE INDEX IF NOT EXISTS notificaciones_fecha_idx ON public.notificaciones_enviadas USING btree (fecha_envio);

-- Comentarios descriptivos
COMMENT ON TABLE notificaciones_enviadas IS 'Registro de todas las notificaciones enviadas a clientes (email, whatsapp, sms)';
COMMENT ON COLUMN notificaciones_enviadas.tipo IS 'Tipo de notificación: email, whatsapp, sms';
COMMENT ON COLUMN notificaciones_enviadas.estado IS 'Estado del envío: enviado, fallido, pendiente';
COMMENT ON COLUMN notificaciones_enviadas.destinatario IS 'Email, teléfono o identificador del destinatario';
COMMENT ON COLUMN notificaciones_enviadas.error_mensaje IS 'Mensaje de error si el envío falló';

-- Verificar la creación
SELECT 
    'Tabla notificaciones_enviadas creada exitosamente' as mensaje,
    COUNT(*) as registros_actuales
FROM notificaciones_enviadas;
