import { Router } from 'express';

import {
  requireAdmin,
  requireAuth,
  requireMemberAccess,
} from '@/middlewares/auth.middleware';

import {
  cancelPayment,
  createAdjustment,
  createConfiguration,
  createMonthlyFee,
  createMonthlyFees,
  createPayment,
  deleteAdjustment,
  getAdjustmentsByMember,
  getConfigurationHistory,
  getCurrentConfiguration,
  getFeeStatusByMember,
  getFeesByMember,
  getFeesDashboard,
  getPaymentsByMember,
  getRecentPayments,
  updateConfiguration,
} from './fee.controller';

const router = Router();

router.get('/resumen', requireAuth, requireAdmin, getFeesDashboard);

router.get(
  '/configuracion',
  requireAuth,
  requireAdmin,
  getCurrentConfiguration,
);

router.get(
  '/configuracion/historial',
  requireAuth,
  requireAdmin,
  getConfigurationHistory,
);

router.post('/configuracion', requireAuth, requireAdmin, createConfiguration);

router.patch(
  '/configuracion/:id',
  requireAuth,
  requireAdmin,
  updateConfiguration,
);

router.get('/pagos/recientes', requireAuth, requireAdmin, getRecentPayments);

router.post('/generar', requireAuth, requireAdmin, createMonthlyFees);

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

router.patch('/:pagoId/anular', requireAuth, requireAdmin, cancelPayment);

router.delete(
  '/ajustes/:adjustmentId',
  requireAuth,
  requireAdmin,
  deleteAdjustment,
);

export default router;
