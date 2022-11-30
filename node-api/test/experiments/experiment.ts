import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean } from '../test-helpers';
import {
  buildBinaryExperiment,
  buildExperiment,
  IExperiment,
} from '../../src/experiments/experiment';
import Counter from '../../src/lib/counter';
import { ABTestingEvent } from '../../src/models';

describe('Experiment', () => {
  const sandbox = sinon.createSandbox();
  let counterStub: sinon.SinonStub;
  let experiment: IExperiment<string>;

  before(() => clean());
  afterEach(async () => {
    // destroy tries to call out to firebase
    sandbox.stub(Counter.prototype, 'destroy').resolves();
    if (experiment) {
      await experiment.cleanup();
    }
    await clean(sandbox);
  });

  context('with limit', () => {
    it('should return the experiment value up to the limit', async () => {
      counterStub = sandbox.stub(Counter.prototype, 'getValue');
      sandbox.stub(Counter.prototype, 'increment');
      [0, 1, 2, 3].forEach((value, index) => {
        counterStub.onCall(index).resolves(value);
      });

      const experimentOptions = {
        name: 'limited_experiment',
        controlValue: 'control',
        experimentValue: 'experiment',
        ratio: 1,
        limit: 3,
      };

      for (let i = 0; i <= 2; i++) {
        experiment = buildBinaryExperiment(i, experimentOptions);

        expect(await experiment.getResult()).to.eq('experiment');
      }

      const experimentAfterLimit = buildBinaryExperiment(1, experimentOptions);
      expect(await experimentAfterLimit.getResult()).to.eq('control');
    });

    it('should never return the experiment value with zero limit', async () => {
      counterStub = sandbox.stub(Counter.prototype, 'getValue');
      counterStub.resolves(0);
      sandbox.stub(Counter.prototype, 'increment');

      const experimentOptions = {
        name: 'limited_experiment',
        controlValue: 'control',
        experimentValue: 'experiment',
        ratio: 1,
        limit: 0,
      };

      for (let i = 0; i <= 100; i++) {
        experiment = buildBinaryExperiment(i, experimentOptions);
        expect(await experiment.getResult()).to.eq('control');
      }
    });
  });

  context('with no limit', () => {
    it('should always return the experiment value', async () => {
      counterStub = sandbox.stub(Counter.prototype, 'getValue');
      counterStub.resolves(1);
      sandbox.stub(Counter.prototype, 'increment');

      const experimentOptions = {
        name: 'limited_experiment',
        controlValue: 'control',
        experimentValue: 'experiment',
        ratio: 1,
      };

      for (let i = 0; i <= 100; i++) {
        experiment = buildBinaryExperiment(i, experimentOptions);
        expect(await experiment.getResult()).to.eq('experiment');
      }
    });
  });

  it('does not allow ratios that add to more than 1', () => {
    expect(() => {
      buildExperiment(1, {
        name: 'too much ratio',
        controlValue: 'control',
        experimentValues: [
          {
            ratio: 0.5,
            experimentValue: 'a value',
          },
          {
            ratio: 0.6,
            experimentValue: 'other value',
          },
        ],
      });
    }).to.throw('experiment ratios cannot add up to more than 1');
  });

  it('stores experiment values in an ABTestingEvent', async () => {
    const experimentOptions = {
      name: 'exciting_experiment',
      controlValue: 'control',
      experimentValue: 'experiment',
      ratio: 1,
    };

    experiment = buildBinaryExperiment(1, experimentOptions);
    const result = await experiment.getResult();

    const record = await ABTestingEvent.findOne({
      where: { userId: 1, eventName: 'exciting_experiment' },
    });

    expect(result).to.eq('experiment');
    expect(record).to.exist;
    expect(record.extra.result).to.eq(result);
  });

  it('stores only one ABTestingEvent per experiment instance', async () => {
    const experimentOptions = {
      name: 'exciting_experiment',
      controlValue: 'control',
      experimentValue: 'experiment',
      ratio: 1,
    };

    experiment = buildBinaryExperiment(1, experimentOptions);
    for (let i = 0; i < 10; i++) {
      await experiment.getResult();
    }

    const count = await ABTestingEvent.count({
      where: { userId: 1, eventName: 'exciting_experiment' },
    });

    expect(count).to.eq(1);
  });

  it('does not store control value in an ABTestingEvent', async () => {
    const experimentOptions = {
      name: 'boring_experiment',
      controlValue: 'control',
      experimentValue: 'experiment',
      ratio: 0,
    };

    experiment = buildBinaryExperiment(1, experimentOptions);
    const result = await experiment.getResult();
    const record = await ABTestingEvent.findOne({
      where: { userId: 1, eventName: 'boring_experiment' },
    });

    expect(result).to.eq('control');
    expect(record).not.to.exist;
  });
});
