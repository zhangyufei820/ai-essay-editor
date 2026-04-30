import { loadConfig } from './config';
import { createServer } from './server';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = await createServer(config);
  server.listen(config.port, () => {
    console.log(`essay-ai-suite listening on :${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
