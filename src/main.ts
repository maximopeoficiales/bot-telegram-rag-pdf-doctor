import { env } from './config/env.js';

function main() {
  console.log(`Telegram bot MVP bootstrap ready on port ${env.PORT}`);
}

main();
