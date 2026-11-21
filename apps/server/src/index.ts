import { buildApp } from './app';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Mematikan server…');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: app.config.PORT, host: app.config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
