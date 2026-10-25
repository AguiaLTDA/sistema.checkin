import { construirApp } from './app.js';
import { env } from './env.js';
import { prisma } from './prisma.js';

async function principal(): Promise<void> {
  const app = await construirApp();

  const encerrar = async (sinal: string) => {
    app.log.info(`recebido ${sinal}, encerrando...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));

  // Plataformas como o Render atribuem a porta em tempo de execucao via PORT;
  // API_PORT continua valendo no dev local, onde PORT nao esta definida.
  const porta = process.env.PORT ? Number(process.env.PORT) : env.API_PORT;

  await app.listen({ port: porta, host: env.API_HOST });
  app.log.info(`API UNIVC Check-in ouvindo em ${env.API_HOST}:${porta}`);
}

principal().catch((erro) => {
  console.error('falha ao iniciar a API:', erro);
  process.exit(1);
});
