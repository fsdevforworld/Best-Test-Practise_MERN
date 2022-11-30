import yargs from 'yargs';
import logger from '../../src/lib/logger';
import { MockAuthentication } from '../../src/services/sombra/mock';

export function main(): void {
  const args = yargs(process.argv.slice(2))
    .scriptName('npm run mock-auth --')
    .usage('$0 <cmd> [args]')
    .command('login [id]', 'login as a user by [id]', argv => {
      argv.positional('id', {
        type: 'number',
        describe: 'The user id to login with',
      });
      argv.option('exp', {
        alias: 'expiration',
        describe: 'Expiration in seconds, as in unix epoch time',
        type: 'number',
      });
    })
    .number(['exp', 'id'])
    .check((argv, options) => {
      return argv.id !== undefined && !isNaN(argv.id);
    })
    .check((argv, options) => {
      return argv.exp === undefined || !isNaN(argv.exp);
    })
    .demandOption('id')
    .demandCommand(1, 'Select one command')
    .help('help').argv;

  const command = args._[0];
  switch (command) {
    case 'login':
      // tslint:disable-next-line:no-console
      console.info(MockAuthentication.createTokens({ id: args.id, exp: args.exp }).accessToken);
      break;
    default:
      logger.error('Invalid Command');
      break;
  }
}

if (require.main === module) {
  main();
}
