import loomisClient from '@dave-inc/loomis-client';
import * as sinon from 'sinon';
import * as SynapsePayBalanceCheck from '../../src/crons/synapsepay-balance-check';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import { expect } from 'chai';

describe('SynapsePay account balance check task', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.reset());
  it('should send the fee node balance as a metric to datadog', async () => {
    const datadogspy = sandbox.spy(dogstatsd, 'gauge');
    sandbox.stub(loomisClient, 'synapsePayGetDisburserBalance').resolves({ data: 999 });

    await SynapsePayBalanceCheck.main();
    expect(datadogspy).to.have.callCount(1);
    expect(datadogspy.getCall(0).args[0]).to.equal('synapse_balance_check.fee_node_balance');
    expect(datadogspy.getCall(0).args[1]).to.equal(999);
  });
});
