import { buildApp } from './app';

async function main() {
  const { app, config } = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Swagger UI: http://localhost:${config.port}/docs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
