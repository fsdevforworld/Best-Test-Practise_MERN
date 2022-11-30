import 'mocha';

import { devSeeds, main } from '../../bin/dev-seed';
import { expect } from 'chai';
import { User, BankConnection } from '../../src/models';
import { ccpaDeleteRequest, userIdClasses } from '../../bin/scripts/ccpa-remove-user-data';
import factory from '../factories';
import loomisClient from '@dave-inc/loomis-client';
import * as Rewards from '../../src/domain/rewards';
import * as sinon from 'sinon';
import * as PaymentMethodDomain from '../../src/domain/payment-method';
import braze from '../../src/lib/braze';
import amplitude from '../../src/lib/amplitude';
import * as Bluebird from 'bluebird';
import { stubBalanceLogClient, stubBankTransactionClient, clean } from '../test-helpers';
import * as Synapse from '../../src/domain/synapsepay';
import SynapsepayNode from '../../src/domain/synapsepay/node';
import { sampleSize } from 'lodash';
import { BankingDataSource } from '@dave-inc/wire-typings';

describe('CCPA remove user data request', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    sandbox.stub(SynapsepayNode, 'deleteSynapsePayNode').resolves();
  });

  afterEach(() => clean(sandbox));

  it('Should throw an error if we cannot find the deleter user', async () => {
    await expect(ccpaDeleteRequest(10000, null)).to.be.rejectedWith('No user found');
  });

  it('Should throw an error if we cannot find the user to be deleted', async () => {
    const user = await factory.create('user');
    await expect(ccpaDeleteRequest(user.id, 10000)).to.be.rejectedWith('No user found');
  });

  // I have tested all of them but to run all of them in the test suite would take +7 minutes
  sampleSize(devSeeds, 5)
    // filter out internal users since it depends on another seed for some ridiculous reason.
    .filter(n => !['dashboard-data', 'ram', 'open-advance'].includes(n))
    .forEach(seed => {
      context(`For dev seed ${seed}`, () => {
        let users: User[];
        let deleter: User;
        beforeEach(async () => {
          await main('up', [seed]);
          users = await User.findAll();
          deleter = await factory.create('user');
          await factory.create('internal-user', { id: deleter.id });
        });

        it(`Safely deletes users ${seed} from the DB`, async () => {
          await Bluebird.each(users, async user => {
            const bodConnection = await BankConnection.findOne({
              where: {
                userId: user.id,
                bankingDataSource: BankingDataSource.BankOfDave,
              },
              paranoid: false,
            });
            const paymentMethod = { id: 1 };
            const getStub = sandbox
              .stub(loomisClient, 'getPaymentMethods')
              .resolves({ data: [paymentMethod] });
            const deleteRewardsStub = sandbox.stub(Rewards, 'deleteEmpyrCard');
            const paymentDeleteStub = sandbox.stub(PaymentMethodDomain, 'softDeletePaymentMethod');
            const brazeDeleteStub = sandbox.stub(braze, 'deleteUser');
            const amplitudeDeleteStub = sandbox.stub(amplitude, 'deleteUser');
            const synapseDeleteStub = sandbox.stub(Synapse, 'deleteSynapsePayUser');

            await ccpaDeleteRequest(deleter.id, user.id);
            await user.reload({ paranoid: false });

            if (!bodConnection) {
              expect(user.firstName).to.eq(null, `${user.phoneNumber} first name not cleared`);
              expect(user.lastName).to.eq(null, `${user.phoneNumber} last name not cleared`);
            }

            sinon.assert.calledOnce(synapseDeleteStub);

            expect(paymentDeleteStub.callCount).to.eq(
              1,
              `${user.phoneNumber} payment delete not called`,
            );
            expect(brazeDeleteStub.callCount).to.eq(1),
              `${user.phoneNumber} braze delete not called`;
            expect(amplitudeDeleteStub.callCount).to.eq(
              1,
              `${user.phoneNumber} amplitude delete not called`,
            );

            await Bluebird.each(userIdClasses, async model => {
              expect(await model.count({ where: { userId: user.id } })).to.eq(0);
            });

            paymentDeleteStub.restore();
            brazeDeleteStub.restore();
            amplitudeDeleteStub.restore();
            getStub.restore();
            deleteRewardsStub.restore();
            synapseDeleteStub.restore();
          });
        });
      });
    });

  it('wont delete PII for bod user', async () => {
    const deleter = await factory.create('user');
    await factory.create('internal-user', { id: deleter.id });
    const account = await factory.create('bod-checking-account');
    const user: User = await account.getUser();
    await user.update({
      addressLine1: '420 blaze it st.',
      addressLine2: 'APT 666',
      zipCode: 'bacon',
      ssn: 'sss-ss-nake',
    });
    const paymentMethod = { id: 1 };
    sandbox.stub(loomisClient, 'getPaymentMethods').resolves({ data: [paymentMethod] });
    sandbox.stub(Rewards, 'deleteEmpyrCard');
    sandbox.stub(PaymentMethodDomain, 'softDeletePaymentMethod');
    sandbox.stub(braze, 'deleteUser');
    sandbox.stub(amplitude, 'deleteUser');
    sandbox.stub(Synapse, 'deleteSynapsePayUser');

    await ccpaDeleteRequest(deleter.id, user.id);
    await user.reload({ paranoid: false });

    expect(user.firstName).not.to.be.null;
    expect(user.lastName).not.to.be.null;
    expect(user.addressLine1).not.to.be.null;
    expect(user.addressLine2).not.to.be.null;
    expect(user.zipCode).not.to.be.null;
    expect(user.ssn).not.to.be.null;
  });
});
