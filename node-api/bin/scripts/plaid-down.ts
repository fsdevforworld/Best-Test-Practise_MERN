import plaidDown from '../../src/helper/plaid-down';
import logger from '../../src/lib/logger';

async function main() {
  const upOrDown = process.argv[2];
  switch (upOrDown) {
    case 'up':
      return await plaidDown.hidePlaidDownAndSendNotifications();
    case 'down':
      return await plaidDown.showPlaidDownScreen();
    default:
      const red = '\x1b[31m';
      const reset = '\x1b[0m';
      logger.error(`${red} Invalid Option\nUsage: plaid-down [up|down] ${reset}`);
  }
}

main().then(() => process.exit());
