import * as sinon from 'sinon';
import factory from '../factories';
import { Config } from '../../src/models';
import * as envConfig from 'config';
import { expect } from 'chai';
import 'mocha';
import { clean, stubBankTransactionClient, up } from '../test-helpers';
import PlaidDownHelper from '../../src/helper/plaid-down';
import braze from '../../src/lib/braze';

describe('PlaidDown', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    return up();
  });
  afterEach(() => clean(sandbox));

  describe('showPlaidDownScreen', () => {
    it('should update plaid down value to true', async () => {
      await factory.create('config', { key: 'PLAID_DOWN', value: false });
      await PlaidDownHelper.showPlaidDownScreen();
      const [PlaidDownSetting] = await Config.findAll({
        where: {
          key: 'PLAID_DOWN',
        },
      });
      expect(PlaidDownSetting.value).to.be.true;
    });
  });

  describe('hidePlaidDownAndSendNotifications', () => {
    it('should update plaid down value to false', async () => {
      const triggerCampaignResult = { success: true };
      sandbox.stub(envConfig, 'get').returns('campaign_id');
      const triggerCampaignStub = sandbox
        .stub(braze, 'triggerCampaign')
        .resolves(triggerCampaignResult);

      await factory.create('config', { key: 'PLAID_DOWN', value: true });
      const result = await PlaidDownHelper.hidePlaidDownAndSendNotifications();
      const [PlaidDownSetting] = await Config.findAll({
        where: {
          key: 'PLAID_DOWN',
        },
      });

      expect(triggerCampaignStub).to.be.calledWith({
        campaign_id: 'campaign_id',
        broadcast: true,
      });
      expect(result).to.deep.equal([triggerCampaignResult, triggerCampaignResult]);
      expect(PlaidDownSetting.value).to.be.false;
    });
  });
});
