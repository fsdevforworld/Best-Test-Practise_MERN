import { isDevEnv, isStagingEnv } from '../../src/lib/utils';
import { main } from '.';
import logger from '../../src/lib/logger';

if (isDevEnv() || isStagingEnv()) {
  main(process.argv[2] || 'up').then(resolve, err);
}

function resolve() {
  process.exit(0);
}

function err(e: Error) {
  logger.error('Dev seed error', { e });
  process.exit(1);
}
