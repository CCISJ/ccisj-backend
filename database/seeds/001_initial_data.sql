-- =========================
-- USUARIOS
-- =========================

INSERT INTO usuario (email, password, tipo)
VALUES
    ('admin@ccisj.uy', 'password_test', 'BACKOFFICE'),
    ('empresa@ccisj.uy', 'password_test', 'SOCIO'),
    ('postulante@ccisj.uy', 'password_test', 'POSTULANTE');


-- =========================
-- SOCIO
-- =========================

INSERT INTO socio (
    usuario_id,
    nombre,
    rut,
    email,
    telefono,
    direccion,
    tipo
)
VALUES (
    (SELECT id FROM usuario WHERE email = 'empresa@ccisj.uy'),
    'Empresa de Prueba',
    '123456789012',
    'empresa@ccisj.uy',
    '099123456',
    'San José',
    'COMUN'
);


-- =========================
-- POSTULANTE
-- =========================

INSERT INTO postulante (
    usuario_id,
    nombre,
    apellido,
    telefono
)
VALUES (
    (SELECT id FROM usuario WHERE email = 'postulante@ccisj.uy'),
    'Juan',
    'Pérez',
    '098123456'
);


-- =========================
-- CV
-- =========================

INSERT INTO cv (
    postulante_id,
    archivo_url,
    descripcion
)
VALUES (
    (
        SELECT id
        FROM postulante
        WHERE nombre = 'Juan'
          AND apellido = 'Pérez'
    ),
    '/uploads/cv/juan-perez.pdf',
    'CV de prueba de Juan Pérez'
);


-- =========================
-- CATEGORIAS
-- =========================

INSERT INTO categoria (nombre, descripcion)
VALUES
    ('Administración', 'Puestos administrativos y de oficina'),
    ('Tecnología', 'Informática, sistemas y tecnología'),
    ('Logística', 'Depósito, distribución y logística'),
    ('Ventas', 'Ventas y atención comercial'),
    ('Contabilidad', 'Contabilidad y finanzas');


-- =========================
-- OFERTA
-- =========================

INSERT INTO oferta (
    socio_id,
    creada_por,
    titulo,
    descripcion,
    ubicacion,
    modalidad,
    cantidad_vacantes
)
VALUES (
    (
        SELECT id
        FROM socio
        WHERE rut = '123456789012'
    ),
    (
        SELECT id
        FROM usuario
        WHERE email = 'empresa@ccisj.uy'
    ),
    'Auxiliar administrativo',
    'Se busca auxiliar administrativo para tareas generales de oficina.',
    'San José de Mayo',
    'PRESENCIAL',
    2
);


-- =========================
-- CATEGORIAS DE LA OFERTA
-- =========================

INSERT INTO oferta_categoria (
    oferta_id,
    categoria_id
)
VALUES
(
    (
        SELECT id
        FROM oferta
        WHERE titulo = 'Auxiliar administrativo'
    ),
    (
        SELECT id
        FROM categoria
        WHERE nombre = 'Administración'
    )
),
(
    (
        SELECT id
        FROM oferta
        WHERE titulo = 'Auxiliar administrativo'
    ),
    (
        SELECT id
        FROM categoria
        WHERE nombre = 'Contabilidad'
    )
);


-- =========================
-- POSTULACION
-- =========================

INSERT INTO postulacion (
    oferta_id,
    postulante_id,
    estado,
    observaciones
)
VALUES (
    (
        SELECT id
        FROM oferta
        WHERE titulo = 'Auxiliar administrativo'
    ),
    (
        SELECT id
        FROM postulante
        WHERE nombre = 'Juan'
          AND apellido = 'Pérez'
    ),
    'ENVIADA',
    'Postulación de prueba'
);