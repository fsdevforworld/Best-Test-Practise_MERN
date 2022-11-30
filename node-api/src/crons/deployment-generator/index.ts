import { runTaskGracefully } from '../../lib/utils';
import { buildYaml } from './build-yaml';
import { crons } from '../index';

async function run() {
  crons.forEach(cron => buildYaml(cron));
}

runTaskGracefully(run);
