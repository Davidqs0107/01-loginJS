-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION postgres;

-- DROP SEQUENCE clientes_id_seq;

CREATE SEQUENCE clientes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE cuotas_id_seq;

CREATE SEQUENCE cuotas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE descargos_id_seq;

CREATE SEQUENCE descargos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE empresa_planes_id_seq;

CREATE SEQUENCE empresa_planes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE empresas_id_seq;

CREATE SEQUENCE empresas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE pagos_id_seq;

CREATE SEQUENCE pagos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE planes_id_seq;

CREATE SEQUENCE planes_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE prestamo_archivos_id_seq;

CREATE SEQUENCE prestamo_archivos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE prestamos_id_seq;

CREATE SEQUENCE prestamos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE usuarios_id_seq;

CREATE SEQUENCE usuarios_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;-- public.empresas definition

-- Drop table

-- DROP TABLE empresas;

CREATE TABLE empresas (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	nombre text NOT NULL,
	direccion text NULL,
	logo text NULL,
	latitud numeric(10, 8) NULL,
	longitud numeric(11, 8) NULL,
	telefono text NULL,
	estado bool DEFAULT true NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT empresas_pkey PRIMARY KEY (id)
);


-- public.planes definition

-- Drop table

-- DROP TABLE planes;

CREATE TABLE planes (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	nombre varchar(50) NOT NULL,
	duracion_dias int4 NOT NULL,
	precio numeric(10, 2) NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT planes_pkey PRIMARY KEY (id)
);


-- public.clientes definition

-- Drop table

-- DROP TABLE clientes;

CREATE TABLE clientes (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	empresa_id int8 NOT NULL,
	nombre text NOT NULL,
	apellido text NOT NULL,
	telefono text NULL,
	direccion text NULL,
	ci text NULL,
	latitud numeric(10, 8) NULL,
	longitud numeric(11, 8) NULL,
	estado bool DEFAULT true NULL,
	email text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT clientes_pkey PRIMARY KEY (id),
	CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);


-- public.empresa_planes definition

-- Drop table

-- DROP TABLE empresa_planes;

CREATE TABLE empresa_planes (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	empresa_id int4 NOT NULL,
	plan_id int4 NOT NULL,
	fecha_inicio timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	fecha_fin timestamp NOT NULL,
	estado varchar(20) DEFAULT 'activo'::character varying NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT empresa_planes_pkey PRIMARY KEY (id),
	CONSTRAINT empresa_planes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
	CONSTRAINT empresa_planes_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES planes(id) ON DELETE SET NULL
);


-- public.usuarios definition

-- Drop table

-- DROP TABLE usuarios;

CREATE TABLE usuarios (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	empresa_id int8 NOT NULL,
	rol text NOT NULL,
	nombre text NOT NULL,
	apellido text NULL,
	telefono text NULL,
	email text NOT NULL,
	ci text NULL,
	estado bool DEFAULT true NULL,
	"password" varchar NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT usuarios_email_key UNIQUE (email),
	CONSTRAINT usuarios_pkey PRIMARY KEY (id),
	CONSTRAINT usuarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);


-- public.descargos definition

-- Drop table

-- DROP TABLE descargos;

CREATE TABLE descargos (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	usuario_id int8 NOT NULL,
	monto numeric(15, 2) NOT NULL,
	fecha timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	estado text DEFAULT 'pendiente'::text NULL,
	tipo_pago text DEFAULT 'efectivo'::text NULL,
	nota text NULL,
	empresa_id int8 NULL,
	CONSTRAINT descargos_pkey PRIMARY KEY (id),
	CONSTRAINT descargos_empresas_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id),
	CONSTRAINT descargos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
CREATE INDEX descargos_usuario_id_idx ON public.descargos USING btree (usuario_id, empresa_id);


-- public.prestamos definition

-- Drop table

-- DROP TABLE prestamos;

CREATE TABLE prestamos (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	cliente_id int8 NOT NULL,
	usuario_id int8 NOT NULL,
	monto numeric(15, 2) NOT NULL,
	tasa_interes numeric(5, 2) NOT NULL,
	frecuencia_pago text NOT NULL,
	total_cuotas int4 NOT NULL,
	fecha_inicio date NOT NULL,
	estado bool DEFAULT true NULL,
	empresa_id int8 NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	tipo_prestamo text DEFAULT 'cuotas'::text NOT NULL,
	documento text NULL,
	estado_prestamo text DEFAULT 'pendiente'::text NULL,
	CONSTRAINT chk_estado_prestamo CHECK ((estado_prestamo = ANY (ARRAY['pendiente'::text, 'activo'::text, 'completado'::text, 'incumplido'::text]))),
	CONSTRAINT prestamos_pkey PRIMARY KEY (id),
	CONSTRAINT prestamos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
	CONSTRAINT prestamos_empresas_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id),
	CONSTRAINT prestamos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);


-- public.cuotas definition

-- Drop table

-- DROP TABLE cuotas;

CREATE TABLE cuotas (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	prestamo_id int8 NOT NULL,
	numero_cuota int4 NOT NULL,
	fecha_pago date NOT NULL,
	monto numeric(15, 2) NOT NULL,
	monto_pagado numeric(15, 2) DEFAULT 0 NULL,
	estado text DEFAULT 'pendiente'::text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT cuotas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'pagada'::text, 'parcial'::text]))),
	CONSTRAINT cuotas_pkey PRIMARY KEY (id),
	CONSTRAINT cuotas_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
);


-- public.pagos definition

-- Drop table

-- DROP TABLE pagos;

CREATE TABLE pagos (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	cuota_id int8 NOT NULL,
	usuario_id int8 NOT NULL,
	monto numeric(15, 2) NOT NULL,
	fecha_pago timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	tipo_pago text DEFAULT 'efectivo'::text NULL,
	CONSTRAINT pagos_pkey PRIMARY KEY (id),
	CONSTRAINT pagos_cuota_id_fkey FOREIGN KEY (cuota_id) REFERENCES cuotas(id),
	CONSTRAINT pagos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);


-- public.prestamo_archivos definition

-- Drop table

-- DROP TABLE prestamo_archivos;

CREATE TABLE prestamo_archivos (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	prestamo_id int8 NOT NULL,
	nombre_archivo varchar(255) NOT NULL,
	ruta_archivo text NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT prestamo_archivos_pkey PRIMARY KEY (id),
	CONSTRAINT prestamo_archivos_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE
);


-- public.notificaciones_enviadas definition

-- Drop table

-- DROP TABLE notificaciones_enviadas;

CREATE TABLE notificaciones_enviadas (
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
CREATE INDEX notificaciones_cuota_idx ON public.notificaciones_enviadas USING btree (cuota_id, tipo, estado);
CREATE INDEX notificaciones_fecha_idx ON public.notificaciones_enviadas USING btree (fecha_envio);