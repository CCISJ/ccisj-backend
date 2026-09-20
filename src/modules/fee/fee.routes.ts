import { Router } from 'express';

import {
  requireAdmin,
  requireAuth,
  requireMemberAccess,
} from '@/middlewares/auth.middleware';

import {
  createAdjustment,
  createConfiguration,
  createMonthlyFee,
  createPayment,
  deletePayment,
  getAdjustmentsByMember,
  getConfigurationHistory,
  getCurrentConfiguration,
  getFeeStatusByMember,
  getFeesByMember,
  getFeesDashboard,
  getPaymentsByMember,
  getRecentPayments,
} from './fee.controller';

const router = Router();

router.get('/resumen', requireAuth, requireAdmin, getFeesDashboard);

router.get('/configuracion', requireAuth, getCurrentConfiguration);

router.get('/configuracion/historial', requireAuth, getConfigurationHistory);

router.post('/configuracion', requireAuth, requireAdmin, createConfiguration);

router.get('/pagos/recientes', requireAuth, requireAdmin, getRecentPayments);

router.get(
  '/socio/:socioId',
  requireAuth,
  requireMemberAccess,
  getFeesByMember,
);

router.post('/socio/:socioId', requireAuth, requireAdmin, createMonthlyFee);

router.get(
  '/socio/:socioId/ajustes',
  requireAuth,
  requireMemberAccess,
  getAdjustmentsByMember,
);

router.post(
  '/socio/:socioId/ajustes',
  requireAuth,
  requireAdmin,
  createAdjustment,
);

router.get(
  '/socio/:socioId/pagos',
  requireAuth,
  requireMemberAccess,
  getPaymentsByMember,
);

router.post('/socio/:socioId/pagos', requireAuth, requireAdmin, createPayment);

router.get(
  '/socio/:socioId/estado',
  requireAuth,
  requireMemberAccess,
  getFeeStatusByMember,
);

router.delete('/pagos/:pagoId', requireAuth, requireAdmin, deletePayment);

export default router;
