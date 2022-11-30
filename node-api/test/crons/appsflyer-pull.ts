import { clean, up } from '../test-helpers';
import { expect } from 'chai';
import { runTask, TaskName } from '../../src/crons/appsflyer-pull';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { CampaignInfo, CampaignInfoContributor } from '../../src/models';
import { RawReportRecord } from '../../src/typings/appsflyer';
import * as request from 'superagent';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';
import { Platforms } from '../../src/typings';

describe('Appsflyer Pull Task', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  it('should set uninstall date on existing record', async () => {
    const appsflyerDeviceId = '1564518574963-2008948';

    await CampaignInfo.create({ appsflyerDeviceId });
    const count = await CampaignInfo.count({ where: { appsflyerDeviceId } });
    expect(count).to.equal(1);

    const record: RawReportRecord = {
      'Event Time': '2019-08-07 12:12:58',
      'Event Name': 'uninstall',
      'AppsFlyer ID': appsflyerDeviceId,
    };
    stubGetReport(record);
    const day = moment().format('YYYY-MM-DD');
    await runTask(TaskName.uninstall, Platforms.iOS, day, day, { delay: 0 });

    const info = await CampaignInfo.findOne({
      where: {
        appsflyerDeviceId,
      },
    });
    expect(info.appsflyerUninstalledDate.format('YYYY-MM-DD')).to.equal('2019-08-07');
  });

  it('should set contributor info', async () => {
    const record: RawReportRecord = {
      'AppsFlyer ID': '1564518574963-2008948',
      'Contributor 1 Partner': '',
      'Contributor 1 Media Source': 'facebook',
      'Contributor 1 Campaign': 'iOS_FB_AdvanceConfirmed',
      'Contributor 1 Touch Type': 'impression',
      'Contributor 1 Touch Time': '2019-08-07 22:27:11',
      'Contributor 2 Partner': '',
      'Contributor 2 Media Source': '',
      'Contributor 2 Campaign': '',
      'Contributor 2 Touch Type': '',
      'Contributor 2 Touch Time': '',
      'Contributor 3 Partner': '',
      'Contributor 3 Media Source': '',
      'Contributor 3 Campaign': '',
      'Contributor 3 Touch Type': '',
      'Contributor 3 Touch Time': '',
    };
    stubGetReport(record);
    const day = moment().format('YYYY-MM-DD');
    await runTask(TaskName.install, Platforms.iOS, day, day, { delay: 0 });

    const info = await CampaignInfoContributor.findOne({
      where: {
        appsflyerDeviceId: '1564518574963-2008948',
      },
    });
    expect(info.network1).to.equal('facebook');
    expect(info.campaign1).to.equal('iOS_FB_AdvanceConfirmed');
    expect(info.touchTime1.format('YYYY-MM-DD')).to.equal('2019-08-07');
    expect(info.touchType1).to.equal('impression');
  });

  it('should set campaign id', async () => {
    const record: RawReportRecord = {
      'AppsFlyer ID': '1564518574963-2008948',
      'Media Source': 'Google AdWords',
      'Campaign ID': '1',
    };
    stubGetReport(record);
    await runTask(TaskName.install, Platforms.iOS, '2019-08-01', '2019-08-01', { delay: 0 });

    const info = await CampaignInfo.findOne({
      where: { appsflyerDeviceId: '1564518574963-2008948' },
    });
    expect(info.campaignId).to.equal('1');
  });

  it('should NOT set campagin id if facebook (not available through pull api)', async () => {
    const record: RawReportRecord = {
      'AppsFlyer ID': '1564518574963-2008948',
      'Media Source': 'Facebook',
      'Campaign ID': '1',
    };
    stubGetReport(record);
    await runTask(TaskName.install, Platforms.iOS, '2019-08-01', '2019-08-01', { delay: 0 });

    const info = await CampaignInfo.findOne({
      where: { appsflyerDeviceId: '1564518574963-2008948' },
    });
    expect(info).to.be.null;
  });

  function stubGetReport(data: any) {
    const header = [];
    const values = [];
    for (const entry of Object.entries(data)) {
      const [key, value] = entry;
      header.push(key);
      values.push(value);
    }
    const csv = `${header.join(',')}\n${values.join(',')}`;
    sandbox.stub(request, 'get').returns({ text: csv });
  }
});
