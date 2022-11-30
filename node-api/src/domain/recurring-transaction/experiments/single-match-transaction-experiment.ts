import * as config from 'config';
import { buildBooleanExperiment } from '../../../experiments/experiment';

export async function shouldDoSingleMatch(userId: number): Promise<boolean> {
  const experiment = getExperiment(userId);
  return experiment.isBucketed();
}

const ratio = config.get<number>('recurringTransaction.singleMatch.experimentRatio');

function getExperiment(userId: number) {
  return buildBooleanExperiment(userId, {
    name: 'single_match_transaction_experiment',
    ratio,
  });
}
