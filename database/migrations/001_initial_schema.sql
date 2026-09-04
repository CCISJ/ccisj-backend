-- =========================
-- TIPOS
-- =========================

CREATE TYPE tipo_usuario AS ENUM (
    'BACKOFFICE',
    'POSTULANTE',
    'SOCIO'
);

CREATE TYPE tipo_socio AS ENUM (
    'COMUN',
    'DIRECTIVO'
);

CREATE TYPE estado_oferta AS ENUM (
    'ACTIVA',
    'CERRADA'
);

CREATE TYPE estado_postulacion AS ENUM (
    'ENVIADA',
    'EN_REVISION',
    'SELECCIONADO',
    'NO_SELECCIONADO',
    'FINALIZADA'
);


-- =========================
-- USUARIO
-- =========================

CREATE TABLE usuario (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    tipo tipo_usuario NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================
-- SOCIO
-- =========================

CREATE TABLE socio (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL UNIQUE,

    nombre VARCHAR(255) NOT NULL,
    rut VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    telefono VARCHAR(50),
    direccion VARCHAR(255),

    tipo tipo_socio NOT NULL DEFAULT 'COMUN',
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_socio_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuario(id)
        ON DELETE CASCADE
);


-- =========================
-- POSTULANTE
-- =========================

CREATE TABLE postulante (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL UNIQUE,

    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(50),

    CONSTRAINT fk_postulante_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuario(id)
        ON DELETE CASCADE
);


-- =========================
-- CV
-- =========================

CREATE TABLE cv (
    id SERIAL PRIMARY KEY,
    postulante_id INTEGER NOT NULL UNIQUE,

    archivo_url VARCHAR(500),
    descripcion TEXT,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cv_postulante
        FOREIGN KEY (postulante_id)
        REFERENCES postulante(id)
        ON DELETE CASCADE
);


-- =========================
-- CATEGORIA
-- =========================

CREATE TABLE categoria (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    activa BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================
-- OFERTA
-- =========================

CREATE TABLE oferta (
    id SERIAL PRIMARY KEY,

    socio_id INTEGER NOT NULL,
    creada_por INTEGER NOT NULL,

    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    ubicacion VARCHAR(255),
    modalidad VARCHAR(100),
    cantidad_vacantes INTEGER NOT NULL DEFAULT 1,

    fecha_publicacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,

    estado estado_oferta NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT fk_oferta_socio
        FOREIGN KEY (socio_id)
        REFERENCES socio(id),

    CONSTRAINT fk_oferta_creador
        FOREIGN KEY (creada_por)
        REFERENCES usuario(id),

    CONSTRAINT chk_cantidad_vacantes
        CHECK (cantidad_vacantes > 0)
);


-- =========================
-- OFERTA - CATEGORIA
-- =========================

CREATE TABLE oferta_categoria (
    oferta_id INTEGER NOT NULL,
    categoria_id INTEGER NOT NULL,

    PRIMARY KEY (oferta_id, categoria_id),

    CONSTRAINT fk_oferta_categoria_oferta
        FOREIGN KEY (oferta_id)
        REFERENCES oferta(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_oferta_categoria_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categoria(id)
        ON DELETE CASCADE
);


-- =========================
-- POSTULACION
-- =========================

CREATE TABLE postulacion (
    id SERIAL PRIMARY KEY,

    oferta_id INTEGER NOT NULL,
    postulante_id INTEGER NOT NULL,

    fecha_postulacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado estado_postulacion NOT NULL DEFAULT 'ENVIADA',
    observaciones TEXT,

    CONSTRAINT fk_postulacion_oferta
        FOREIGN KEY (oferta_id)
        REFERENCES oferta(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_postulacion_postulante
        FOREIGN KEY (postulante_id)
        REFERENCES postulante(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_postulacion
        UNIQUE (oferta_id, postulante_id)
);