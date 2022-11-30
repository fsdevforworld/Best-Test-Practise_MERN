import { once } from 'lodash';
import * as RuleEngine from 'json-rules-engine';
import { AdvanceCollectionTrigger } from '../../typings';
import { Advance } from '../../models';
import rules from './rules';

const getEngine = once(
  (): RuleEngine.Engine => {
    const engine = new RuleEngine.Engine();
    Object.keys(rules).map(key => engine.addRule(rules[key]));
    return engine;
  },
);

async function run(
  advance: Advance,
  paymentAmount: number,
  numSuccessfulCollectionAttempts: number,
  trigger: AdvanceCollectionTrigger,
  isActive: boolean = true,
) {
  const engine = getEngine();

  engine.addFact('advance', advance);

  engine.addFact('paymentAmount', paymentAmount);

  engine.addFact('numSuccessfulCollectionAttempts', numSuccessfulCollectionAttempts);

  engine.addFact('trigger', trigger);

  engine.addFact('isActive', isActive);

  const events = await engine.run();

  return events;
}

export default run;
