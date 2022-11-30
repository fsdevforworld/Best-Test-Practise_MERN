import { SynapseDisburserNodeId } from '@dave-inc/loomis-client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import app from '../../../src/services/loomis-api';
import { clean } from '../../test-helpers';
import Constants from '../../../src/domain/synapsepay/constants';
import { helpers, transactions } from '../../../src/domain/synapsepay';

const {
  SYNAPSEPAY_DISBURSING_NODE_ID,
  SYNAPSEPAY_DISBURSING_USER_ID,
  SYNAPSEPAY_DISBURSING_USER_FINGERPRINT,
  SYNAPSEPAY_FEE_NODE_ID,
  SYNAPSEPAY_RECEIVING_NODE_ID,
} = Constants;

describe('SynapsePay tests', () => {
  const LOOMIS_BASE = '/services/loomis_api';
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  function makeFakeSynapsePayNode(
    balance: number,
    nickname: string = 'pelican',
    id: number = 1234,
  ) {
    return {
      json: {
        _id: id,
        type: 'pelican node',
        info: {
          nickname,
          balance: {
            amount: balance,
          },
        },
      },
    };
  }

  const disbursingArgs = [
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId: SYNAPSEPAY_DISBURSING_NODE_ID },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  ];
  const feeArgs = [
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId: SYNAPSEPAY_FEE_NODE_ID },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  ];
  const receivingArgs = [
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId: SYNAPSEPAY_RECEIVING_NODE_ID },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  ];

  describe('SynapsePay balance retrieval', () => {
    const balanceTests = [
      {
        targetNode: SynapseDisburserNodeId.Disbursing,
        expectedArgs: disbursingArgs,
      },
      {
        targetNode: SynapseDisburserNodeId.Fee,
        expectedArgs: feeArgs,
      },
      {
        targetNode: SynapseDisburserNodeId.Receiving,
        expectedArgs: receivingArgs,
      },
    ];

    balanceTests.forEach(({ targetNode, expectedArgs }) =>
      it(`Should return the correct balance (${targetNode})`, async () => {
        sandbox
          .stub(SynapsepayNodeLib, 'getSynapsePayNode')
          .withArgs(...expectedArgs)
          .resolves(makeFakeSynapsePayNode(65000));

        await request(app)
          .get(`${LOOMIS_BASE}/synapse/${targetNode}/balance`)
          .send()
          .expect(200)
          .then(response => expect(response.body.balance).to.equal(65000));
      }),
    );

    it('should return 404 for an invalid targetNode', async () => {
      await request(app)
        .get(`${LOOMIS_BASE}/synapse/pelican/balance`)
        .send()
        .expect(404);
    });
  });

  describe('SynapsePay Move Funds', () => {
    const validAccountTests = [
      {
        targetNodeId: SynapseDisburserNodeId.Disbursing,
        targetArgs: disbursingArgs,
      },
      {
        targetNodeId: SynapseDisburserNodeId.Fee,
        targetArgs: feeArgs,
      },
    ];

    validAccountTests.forEach(({ targetNodeId, targetArgs }) =>
      it(`Should move funds between valid account pairs (Moving to ${targetNodeId}`, async () => {
        const receivingNode = makeFakeSynapsePayNode(100000, 'receiving pelican', 1234);
        const targetNode = makeFakeSynapsePayNode(100, 'target pelican', 9874);

        const createStub = sandbox.stub(transactions, 'createAsync').resolves();

        sandbox.stub(helpers, 'getUserIP').returns('1.2.3.101');
        sandbox
          .stub(SynapsepayNodeLib, 'getSynapsePayNode')
          .withArgs(...receivingArgs)
          .resolves(receivingNode)
          .withArgs(...targetArgs)
          .resolves(targetNode);

        await request(app)
          .post(`${LOOMIS_BASE}/synapse/move_disburser_funds/${targetNodeId}`)
          .send({ amount: 2001 })
          .expect(200)
          .then(response => {
            expect(response.body).to.deep.equal({ ok: true });
          });

        expect(createStub).to.have.callCount(1);
        expect(createStub).to.have.been.calledWithExactly(receivingNode, {
          to: {
            type: 'pelican node',
            id: 9874,
          },
          amount: {
            amount: 2001,
            currency: 'USD',
          },
          extra: {
            same_day: false,
            note: 'Moving 2001 from receiving pelican to target pelican',
            ip: '1.2.3.101',
          },
          fees: [
            {
              fee: 0,
              note: 'Transfer fee',
              to: {
                id: Constants.SYNAPSEPAY_FEE_NODE_ID,
              },
            },
          ],
        });
      }),
    );

    it('Should give an Invalid Parameters error when trying to move to Receiving node', async () => {
      const targetNodeId = SynapseDisburserNodeId.Receiving;
      const createStub = sandbox.stub(transactions, 'createAsync').resolves();

      await request(app)
        .post(`${LOOMIS_BASE}/synapse/move_disburser_funds/${targetNodeId}`)
        .send({ amount: 2010 })
        .expect(400);

      expect(createStub).to.have.callCount(0);
    });

    it('Should give an Invalid Parameters error with an invalid amount', async () => {
      const targetNodeId = SynapseDisburserNodeId.Disbursing;
      const createStub = sandbox.stub(transactions, 'createAsync').resolves();

      await request(app)
        .post(`${LOOMIS_BASE}/synapse/move_disburser_funds/${targetNodeId}`)
        .send({ amount: 'pelican' })
        .expect(400);

      expect(createStub).to.have.callCount(0);
    });

    it('Should return failure status for insufficient balance', async () => {
      const targetNodeId = SynapseDisburserNodeId.Disbursing;
      const receivingNode = makeFakeSynapsePayNode(1000, 'receiving pelican', 1234);
      const targetNode = makeFakeSynapsePayNode(100, 'target pelican', 9874);

      const createStub = sandbox.stub(transactions, 'createAsync').resolves();

      sandbox.stub(helpers, 'getUserIP').returns('1.2.3.101');
      sandbox
        .stub(SynapsepayNodeLib, 'getSynapsePayNode')
        .withArgs(...receivingArgs)
        .resolves(receivingNode)
        .withArgs(...disbursingArgs)
        .resolves(targetNode);

      await request(app)
        .post(`${LOOMIS_BASE}/synapse/move_disburser_funds/${targetNodeId}`)
        .send({ amount: 2001 })
        .expect(200)
        .then(response => {
          expect(response.body).to.deep.equal({ ok: false });
        });

      expect(createStub).to.have.callCount(0);
    });
  });
});
