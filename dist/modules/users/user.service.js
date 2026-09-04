"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAll = getAll;
exports.getById = getById;
exports.create = create;
exports.update = update;
exports.remove = remove;
const usuarioRepository = __importStar(require("./user.repository"));
async function getAll() {
    return usuarioRepository.findAll();
}
async function getById(id) {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
        throw new Error('Usuario no encontrado');
    }
    return usuario;
}
async function create(data) {
    if (!data.email || !data.password || !data.tipo) {
        throw new Error('Faltan datos obligatorios');
    }
    const existingUser = await usuarioRepository.findByEmail(data.email);
    if (existingUser) {
        throw new Error('El email ya está registrado');
    }
    return usuarioRepository.create(data);
}
async function update(id, data) {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
        throw new Error('Usuario no encontrado');
    }
    if (data.email) {
        const existingUser = await usuarioRepository.findByEmail(data.email);
        if (existingUser && existingUser.id !== id) {
            throw new Error('El email ya está registrado');
        }
    }
    return usuarioRepository.update(id, data);
}
async function remove(id) {
    const usuario = await usuarioRepository.findById(id);
    if (!usuario) {
        throw new Error('Usuario no encontrado');
    }
    return usuarioRepository.remove(id);
}
