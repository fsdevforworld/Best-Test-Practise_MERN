import { createFallbackCharge } from '../../../src/domain/collection/create-fallback-charge';
import factory from '../../factories';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { clean } from '../../test-helpers';

describe('createFallbackCharge', () => {
  const sandbox = sinon.createSandbox();
  const referenceId = 'reference_id';

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  it('only runs the first charge if it is successful', async () => {
    const externalPayment = await factory.build('external-payment', { chargeable: null });
    const firstCharge = sandbox.stub().resolves(externalPayment);
    const secondCharge = sandbox.stub().rejects(new Error('Second charge should not be called'));
    const validator = sandbox.stub().rejects(new Error('Validator should not be called'));

    const charge = await createFallbackCharge(firstCharge, secondCharge, validator);
    const payment = await factory.create('payment', { referenceId });
    const result = await charge(10, payment);

    expect(result.id).to.equal(externalPayment.id);
    sinon.assert.calledWith(firstCharge, 10);
    sinon.assert.notCalled(secondCharge);
    sinon.assert.notCalled(validator);
  });

  it('only runs the second charge if first charge fails and validator succeeds', async () => {
    const externalPayment = await factory.build('external-payment', { chargeable: null });

    const firstChargeError = new Error('First error');
    const firstCharge = sandbox.stub().rejects(firstChargeError);
    const validator = sandbox.stub().resolves(true);
    const secondCharge = sandbox.stub().resolves(externalPayment);

    const charge = createFallbackCharge(firstCharge, secondCharge, validator);
    const payment = await factory.create('payment', { referenceId });

    const result = await charge(20, payment);

    expect(result.id).to.equal(externalPayment.id);
    sinon.assert.calledWith(firstCharge, 20);
    sinon.assert.calledWith(validator, firstChargeError);
    sinon.assert.calledWith(secondCharge, 20);
  });

  it('throws the first charge error if the validator fails', async () => {
    const firstChargeError = new Error('First error');
    const firstCharge = sandbox.stub().rejects(firstChargeError);
    const validator = sandbox.stub().resolves(false);
    const secondCharge = sandbox.stub().rejects(new Error('Second charge'));

    const charge = createFallbackCharge(firstCharge, secondCharge, validator);
    const payment = await factory.create('payment', { referenceId });

    await expect(charge(10, payment)).to.eventually.be.rejectedWith('First error');

    sinon.assert.notCalled(secondCharge);
    sinon.assert.calledWith(validator, firstChargeError);
  });
});
