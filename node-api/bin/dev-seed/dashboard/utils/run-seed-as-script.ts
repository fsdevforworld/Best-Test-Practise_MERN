import logger from '../../../../src/lib/logger';

function resolve() {
  logger.info(`Seed ran successfully`, {
    filename: __filename,
  });
  process.exit(0);
}

function reject(e: Error) {
  logger.error('Seed error', { error: e, filename: __filename });
  process.exit(1);
}

function runSeedAsScript(up: () => Promise<void>, down: () => Promise<void>) {
  const direction = process.argv[2];
  const allowedDirections = ['up', 'down'];

  if (!direction) {
    throw new Error('Must specify a direction');
  }

  if (!allowedDirections.includes(direction)) {
    throw new Error(`Direction: ${direction} not allowed. Must be either up or down`);
  }

  const seed = direction === 'up' ? up : down;

  return seed().then(resolve, reject);
}

export default runSeedAsScript;
