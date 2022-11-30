import { expect } from 'chai';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import { clean } from '../test-helpers';
import amplitude from '../../src/lib/amplitude';
import Experiment from '../../src/experiments/auto-add-expenses-experiment';

describe('Auto Add Expenses Experiment', () => {
  const sandbox = sinon.createSandbox();
  let amplitudeIdentifyStub: SinonStub;

  before(() => clean());
  beforeEach(() => {
    amplitudeIdentifyStub = sandbox.stub(amplitude, 'identify').resolves();
  });
  afterEach(() => clean(sandbox));

  it('should bucket user to one of the choices', () => {
    for (let i = 0; i < 10; i++) {
      const experiment = new Experiment({ userId: i });
      const bucket = experiment.shouldAutoAddExpenses;
      expect([true, false].includes(bucket)).to.be.true;
    }
  });

  it('should set a/b tests user property with bucket result', () => {
    const userId = 1;
    const experiment = new Experiment({ userId });

    const bucket = experiment.shouldAutoAddExpenses; // triggers analytics
    const bucketText = String(bucket).toUpperCase();

    expect(amplitudeIdentifyStub).to.have.callCount(1);
    expect(amplitudeIdentifyStub.firstCall.args[0]).to.deep.equal({
      user_id: userId,
      user_properties: { $postInsert: { 'a/b tests': `shouldAutoAddExpenses:${bucketText}` } },
    });
  });
});
