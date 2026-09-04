"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAll = findAll;
exports.findById = findById;
exports.findByEmail = findByEmail;
exports.create = create;
exports.update = update;
exports.remove = remove;
const prisma_1 = require("@/config/prisma");
function findAll() {
    return prisma_1.prisma.usuario.findMany({
        select: {
            id: true,
            email: true,
            tipo: true,
            activo: true,
            fechaCreacion: true,
        },
        orderBy: {
            id: 'asc',
        },
    });
}
function findById(id) {
    return prisma_1.prisma.usuario.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            tipo: true,
            activo: true,
            fechaCreacion: true,
        },
    });
}
function findByEmail(email) {
    return prisma_1.prisma.usuario.findUnique({
        where: { email },
    });
}
function create(data) {
    return prisma_1.prisma.usuario.create({
        data,
        select: {
            id: true,
            email: true,
            tipo: true,
            activo: true,
            fechaCreacion: true,
        },
    });
}
function update(id, data) {
    return prisma_1.prisma.usuario.update({
        where: { id },
        data,
        select: {
            id: true,
            email: true,
            tipo: true,
            activo: true,
            fechaCreacion: true,
        },
    });
}
function remove(id) {
    return prisma_1.prisma.usuario.delete({
        where: { id },
    });
}
