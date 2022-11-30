import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import Sendgrid from '../../src/lib/sendgrid';
import SynapsepayNodeLib from '../../src/domain/synapsepay/node';
import { emailSynapsepayStatements } from '../../src/crons/email-synapsepay-statements';
import * as SynapsePayUserLib from '../../src/domain/synapsepay/user';

describe('emailSynapsepayStatements', () => {
  const sandbox = sinon.createSandbox();

  let sendgridStub: sinon.SinonStub;

  const now = moment().utc();
  const oneMonthAgo = now
    .clone()
    .startOf('day')
    .subtract(1, 'month');
  const oneMonthAgoStart = oneMonthAgo
    .clone()
    .startOf('month')
    .valueOf();
  const oneMonthAgoEnd = oneMonthAgo
    .clone()
    .endOf('month')
    .valueOf();

  beforeEach(() => {
    sendgridStub = sandbox.stub(Sendgrid, 'sendHtml').resolves();
  });

  afterEach(() => sandbox.restore());

  it("should retrieve last month's statement from synapsepay and email it", async () => {
    const synapsepayNodesStubResponse = [
      { json: { _id: 'gunther', info: { nickname: 'firstTitle' } } },
    ];
    const synapsepayStatementsStubResponse = [
      {
        node_id: 'gunther',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'firstCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal('firstTitle<br>firstCsv');
    expect(sendgridStub.firstCall.args[2]).to.deep.equal(['kyle@dave.com', 'ryanimai@dave.com']);
  });

  it('should retrieve two statements from synapsepay and email them', async () => {
    const synapsepayNodesStubResponse = [
      { json: { _id: 'imus', info: { nickname: 'secondTitle' } } },
      { json: { _id: 'max', info: { nickname: 'firstTitle' } } },
    ];
    const synapsepayStatementsStubResponse = [
      {
        node_id: 'max',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'firstCsv' },
      },
      {
        node_id: 'imus',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'secondCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal(
      'firstTitle<br>firstCsv<br><br>secondTitle<br>secondCsv',
    );
  });

  it('should alphabetize by statement nickname', async () => {
    const synapsepayNodesStubResponse = [
      { json: { _id: 'imus', info: { nickname: 'secondTitle' } } },
      { json: { _id: 'max', info: { nickname: 'firstTitle' } } },
    ];
    const synapsepayStatementsStubResponse = [
      {
        node_id: 'imus',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'secondCsv' },
      },
      {
        node_id: 'max',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'firstCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal(
      'firstTitle<br>firstCsv<br><br>secondTitle<br>secondCsv',
    );
  });

  it('should ignore statements outside of the designated month', async () => {
    const synapsepayNodesStubResponse: any = [];
    const synapsepayStatementsStubResponse = [
      {
        _id: 'imus',
        date_end: moment()
          .endOf('month')
          .startOf('day')
          .valueOf(),
        date_start: moment()
          .startOf('month')
          .valueOf(),
        urls: { csv: 'secondCsv' },
      },
      {
        _id: 'max',
        date_end: moment()
          .subtract(2, 'months')
          .endOf('month')
          .startOf('day')
          .valueOf(),
        date_start: moment()
          .subtract(2, 'months')
          .startOf('month')
          .valueOf(),
        urls: { csv: 'firstCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal(
      `No reports for ${oneMonthAgo.format('MMMM YYYY')} were found.`,
    );
  });

  it("should substitute the node nickname if node isn't found", async () => {
    const synapsepayNodesStubResponse = [
      { json: { _id: 'guntherX', info: { nickname: 'firstTitle' } } },
    ];
    const synapsepayStatementsStubResponse = [
      {
        node_id: 'gunther',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'firstCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal('(node not found)<br>firstCsv');
    expect(sendgridStub.firstCall.args[2]).to.deep.equal(['kyle@dave.com', 'ryanimai@dave.com']);
  });

  it("should substitute the node nickname if node nickname isn't found", async () => {
    const synapsepayNodesStubResponse = [
      { json: { _id: 'gunther', info: { nicknameX: 'firstTitle' } } },
    ];
    const synapsepayStatementsStubResponse = [
      {
        node_id: 'gunther',
        date_end: oneMonthAgoEnd,
        date_start: oneMonthAgoStart,
        urls: { csv: 'firstCsv' },
      },
    ];
    sandbox
      .stub(SynapsePayUserLib, 'getSynapsePayUserStatements')
      .resolves(synapsepayStatementsStubResponse);
    sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves(synapsepayNodesStubResponse);

    await emailSynapsepayStatements();

    expect(sendgridStub.firstCall.args[1]).to.equal('(node nickname not found)<br>firstCsv');
    expect(sendgridStub.firstCall.args[2]).to.deep.equal(['kyle@dave.com', 'ryanimai@dave.com']);
  });
});
