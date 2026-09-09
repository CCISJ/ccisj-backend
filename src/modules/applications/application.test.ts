import request from 'supertest';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '@/app';
import { prisma } from '@/config/prisma';

describe('Applications', () => {
  let userMemberId: number;
  let memberId: number;
  let userApplicantId: number;
  let applicantId: number;
  let cvId: number;
  let categoryId: number;
  let offerId: number;
  let applicationId: number;

  const timestamp = Date.now();

  beforeAll(async () => {
    // =========================
    // SOCIO + USUARIO
    // =========================

    const member = await request(app)
      .post('/socios')
      .send({
        razonSocial: 'Empresa Application Test',
        titular: 'Titular Application Test',
        giroComercial: 'Tecnología',
        tipo: 'COMUN',
        rut: `APP-RUT-${timestamp}`,
        numeroBps: `APP-BPS-${timestamp}`,
        fechaInicioEmpresa: '2020-01-01',
        fechaAfiliacion: '2026-09-01',
        direccion: '18 de Julio 123',
        ciudad: 'San José',
        celular: '099123456',
        telefono: '43421234',
        email: `application-member-${timestamp}@ccisj.uy`,
        observaciones: 'Socio para tests de postulaciones',
      });

    expect(member.status).toBe(201);

    memberId = member.body.socioId;

    const createdMember = await prisma.socio.findUnique({
      where: {
        id: memberId,
      },
    });

    expect(createdMember).not.toBeNull();

    userMemberId = createdMember!.usuarioId;

    // =========================
    // USUARIO POSTULANTE
    // =========================

    const applicantUser = await request(app)
      .post('/usuarios')
      .send({
        email: `application-applicant-${timestamp}@ccisj.uy`,
        password: 'test123',
        tipo: 'POSTULANTE',
      });

    expect(applicantUser.status).toBe(201);

    userApplicantId = applicantUser.body.id;

    // =========================
    // POSTULANTE
    // =========================

    const applicant = await request(app).post('/postulantes').send({
      usuarioId: userApplicantId,
      nombre: 'Application',
      apellido: 'Tester',
    });

    expect(applicant.status).toBe(201);

    applicantId = applicant.body.id;

    // =========================
    // CV
    // =========================

    const cv = await prisma.cv.create({
      data: {
        postulanteId: applicantId,
        archivoUrl: '/uploads/test.pdf',
        descripcion: 'CV de prueba',
      },
    });

    cvId = cv.id;

    // =========================
    // CATEGORÍA
    // =========================

    const category = await request(app)
      .post('/categorias')
      .send({
        nombre: `Application Category ${timestamp}`,
      });

    expect(category.status).toBe(201);

    categoryId = category.body.id;

    // =========================
    // OFERTA
    // =========================

    const offer = await request(app)
      .post('/ofertas')
      .send({
        socioId: memberId,
        creadaPor: userMemberId,
        titulo: 'Oferta para postulaciones',
        descripcion: 'Oferta de prueba',
        ubicacion: 'San José',
        modalidad: 'PRESENCIAL',
        cantidadVacantes: 1,
        categoriaIds: [categoryId],
      });

    expect(offer.status).toBe(201);

    offerId = offer.body.id;
  });

  afterAll(async () => {
    if (applicationId) {
      await prisma.postulacion.deleteMany({
        where: { id: applicationId },
      });
    }

    if (offerId) {
      await prisma.oferta.deleteMany({
        where: { id: offerId },
      });
    }

    if (categoryId) {
      await prisma.categoria.deleteMany({
        where: { id: categoryId },
      });
    }

    if (cvId) {
      await prisma.cv.deleteMany({
        where: { id: cvId },
      });
    }

    if (applicantId) {
      await prisma.postulante.deleteMany({
        where: { id: applicantId },
      });
    }

    if (memberId) {
      await prisma.socio.deleteMany({
        where: { id: memberId },
      });
    }

    const userIds = [userMemberId, userApplicantId].filter((id): id is number =>
      Boolean(id),
    );

    if (userIds.length > 0) {
      await prisma.usuario.deleteMany({
        where: {
          id: {
            in: userIds,
          },
        },
      });
    }

    await prisma.$disconnect();
  });

  it('POST /postulaciones crea una postulación', async () => {
    const response = await request(app).post('/postulaciones').send({
      ofertaId: offerId,
      postulanteId: applicantId,
      observaciones: 'Postulación de prueba',
    });

    expect(response.status).toBe(201);

    expect(response.body.ofertaId).toBe(offerId);
    expect(response.body.postulanteId).toBe(applicantId);
    expect(response.body.estado).toBe('ENVIADA');

    applicationId = response.body.id;
  });

  it('POST /postulaciones evita postularse dos veces', async () => {
    const response = await request(app).post('/postulaciones').send({
      ofertaId: offerId,
      postulanteId: applicantId,
    });

    expect(response.status).toBe(400);

    expect(response.body.message).toBe(
      'El postulante ya se postuló a esta oferta',
    );
  });

  it('GET /postulaciones devuelve una lista', async () => {
    const response = await request(app).get('/postulaciones');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /postulaciones/:id devuelve una postulación', async () => {
    const response = await request(app).get(`/postulaciones/${applicationId}`);

    expect(response.status).toBe(200);

    expect(response.body.id).toBe(applicationId);
    expect(response.body).toHaveProperty('oferta');
    expect(response.body).toHaveProperty('postulante');
  });

  it('PATCH /postulaciones/:id actualiza el estado', async () => {
    const response = await request(app)
      .patch(`/postulaciones/${applicationId}`)
      .send({
        estado: 'EN_REVISION',
        observaciones: 'Revisando candidatura',
      });

    expect(response.status).toBe(200);

    expect(response.body.estado).toBe('EN_REVISION');
    expect(response.body.observaciones).toBe('Revisando candidatura');
  });

  it('POST /postulaciones falla si la oferta no existe', async () => {
    const response = await request(app).post('/postulaciones').send({
      ofertaId: 999999,
      postulanteId: applicantId,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Oferta no encontrada');
  });

  it('GET /postulaciones/:id devuelve 404 si no existe', async () => {
    const response = await request(app).get('/postulaciones/999999');

    expect(response.status).toBe(404);
  });

  it('DELETE /postulaciones/:id elimina la postulación', async () => {
    const response = await request(app).delete(
      `/postulaciones/${applicationId}`,
    );

    expect(response.status).toBe(204);

    const deletedApplication = await prisma.postulacion.findUnique({
      where: {
        id: applicationId,
      },
    });

    expect(deletedApplication).toBeNull();

    applicationId = 0;
  });

  it('DELETE /postulaciones/:id devuelve 404 si no existe', async () => {
    const response = await request(app).delete('/postulaciones/999999');

    expect(response.status).toBe(404);
  });
});
