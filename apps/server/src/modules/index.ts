import type { FastifyInstance } from 'fastify';
import adminRoutes from './admin/routes';
import aiRoutes from './ai/routes';
import authRoutes from './auth/routes';
import closingRoutes from './closing/routes';
import customersRoutes from './customers/routes';
import customerStaffRoutes from './customers/staffRoutes';
import driversRoutes from './drivers/routes';
import expensesRoutes from './expenses/routes';
import geoRoutes from './geo/routes';
import menuRoutes from './menu/routes';
import ordersRoutes from './orders/routes';
import paymentsRoutes from './payments/routes';
import reportsRoutes from './reports/routes';
import shiftsRoutes from './shifts/routes';
import systemRoutes from './system/routes';
import tablesRoutes from './tables/routes';
import telegramRoutes from './telegram/routes';

/** Semua modul route. Path lengkap ada di kontrak, jadi tanpa prefix. */
export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(systemRoutes);
  await app.register(authRoutes);
  await app.register(menuRoutes);
  await app.register(ordersRoutes);
  await app.register(tablesRoutes);
  await app.register(paymentsRoutes);
  await app.register(shiftsRoutes);
  await app.register(expensesRoutes);
  await app.register(closingRoutes);
  await app.register(driversRoutes);
  await app.register(customersRoutes);
  await app.register(customerStaffRoutes);
  await app.register(telegramRoutes);
  await app.register(aiRoutes);
  await app.register(geoRoutes);
  await app.register(reportsRoutes);
  await app.register(adminRoutes);
}
