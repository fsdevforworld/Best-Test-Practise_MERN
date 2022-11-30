import * as request from 'supertest';
import { QueryTypes } from 'sequelize';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, validateRelationships, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  AdvanceApproval,
  BankAccount,
  RecurringTransaction,
  sequelize,
  User,
} from '../../../../../src/models';
import { expect } from 'chai';
import { NodeNames } from '../../../../../src/services/advance-approval/advance-approval-engine/common';
import { IApiRelationshipData, IApiResourceObject } from 'src/typings';
import {
  advanceApprovalSerializers,
  bankAccountSerializers,
  recurringTransactionSerializers,
} from '../../serializers';
import { kebabCase } from 'lodash';
import { moment } from '@dave-inc/time-lib';
import { serializeDate } from '../../../../../src/serialization';

describe('GET /v2/advance-approvals/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  let user: User;
  let bankAccount: BankAccount;
  let advanceApproval: AdvanceApproval;
  let recurringTransaction: RecurringTransaction;
  let req: request.Test;

  beforeEach(async () => {
    user = await factory.create('user');
    const bankConnection = await factory.create('bank-connection', { userId: user.id });
    bankAccount = await factory.create('bank-account', {
      userId: user.id,
      bankConnectionId: bankConnection.id,
    });
    recurringTransaction = await factory.create('recurring-transaction', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    });
  });

  describe('successful approval', () => {
    beforeEach(async () => {
      advanceApproval = await factory.create('advance-approval', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        recurringTransactionId: recurringTransaction.id,
        approved: true,
        defaultPaybackDate: moment().add(7, 'days'),
      });

      await factory.create('advance-node-log', {
        name: NodeNames.EligibilityNode,
        success: true,
        successNodeName: NodeNames.PaydaySolvencyNode,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-node-log', {
        name: NodeNames.PaydaySolvencyNode,
        success: true,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-node-log', {
        name: NodeNames.IncomeValidationFailureGlobalModel100Dollars,
        success: true,
        advanceApprovalId: advanceApproval.id,
        approvalResponse: {
          updates: {},
          isMl: true,
          isExperimental: true,
        },
      });

      await factory.create('advance-rule-log', {
        ruleName: 'bankDisconnected',
        nodeName: NodeNames.EligibilityNode,
        success: true,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-rule-log', {
        ruleName: 'hasInitialPull',
        nodeName: NodeNames.EligibilityNode,
        success: true,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-rule-log', {
        ruleName: 'historicalPaydaySolvency',
        nodeName: NodeNames.PaydaySolvencyNode,
        success: true,
        advanceApprovalId: advanceApproval.id,
      });

      req = request(app)
        .get(`/v2/advance-approvals/${advanceApproval.id}`)
        .expect(200);
    });

    it('responds with correct approval data', async () => {
      const {
        body: { data },
      } = await withInternalUser(req);

      const { created } = await AdvanceApproval.findByPk(advanceApproval.id);

      expect(data.attributes).to.deep.equal({
        approved: true,
        approvedAmounts: [25, 50, 75],
        created: serializeDate(created),
        defaultPaybackDate: serializeDate(advanceApproval.defaultPaybackDate, 'YYYY-MM-DD'),
        initiator: 'user',
      });
    });

    it('responds with correct relationships', async () => {
      const {
        body: { data, included },
      } = await withInternalUser(req);

      validateRelationships(
        { data, included },
        {
          advanceNodeLogs: 'advance-node-log',
          advanceRuleLogs: 'advance-rule-log',
          recurringTransaction: 'recurring-transaction',
        },
      );

      expect(data.relationships.user.data.id).to.equal(user.id.toString());
      expect(data.relationships.bankAccount.data.id).to.equal(bankAccount.id.toString());
    });

    it('responds with correct node log data', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const nodeLogs: advanceApprovalSerializers.IAdvanceNodeLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-node-log',
      );

      expect(nodeLogs).to.have.length(3);

      const {
        attributes: eligibilityNodeAttributes,
        relationships: eligibilityNodeRelationships,
      } = nodeLogs.find(log => log.attributes.name === NodeNames.EligibilityNode);
      const {
        attributes: solvencyNodeAttributes,
        relationships: solvencyNodeRelationships,
      } = nodeLogs.find(log => log.attributes.name === NodeNames.PaydaySolvencyNode);

      expect(eligibilityNodeAttributes.success).to.be.true;
      expect(eligibilityNodeAttributes.isMl).to.be.false;
      expect(eligibilityNodeAttributes.isExperimental).to.be.false;

      expect(solvencyNodeAttributes.success).to.be.true;
      expect(solvencyNodeAttributes.isMl).to.be.false;
      expect(solvencyNodeAttributes.isExperimental).to.be.false;

      // approval, next node log, rule logs
      expect(Object.keys(eligibilityNodeRelationships)).to.have.length(3);

      expect(
        (eligibilityNodeRelationships.advanceApproval.data as IApiRelationshipData).id,
      ).to.equal(advanceApproval.id.toString());
      expect((eligibilityNodeRelationships.nextNodeLog.data as IApiRelationshipData).id).to.equal(
        `${kebabCase(NodeNames.PaydaySolvencyNode)}-${advanceApproval.id}`,
      );
      expect(eligibilityNodeRelationships.advanceRuleLogs.data).to.have.length(2);

      expect(solvencyNodeRelationships.nextNodeLog.data).to.be.null;
    });

    it('should return isMl and isExperimental', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const nodeLogs: advanceApprovalSerializers.IAdvanceNodeLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-node-log',
      );

      expect(nodeLogs).to.have.length(3);

      const { attributes } = nodeLogs.find(
        log => log.attributes.name === NodeNames.IncomeValidationFailureGlobalModel100Dollars,
      );

      expect(attributes.success).to.be.true;
      expect(attributes.isMl).to.be.true;
      expect(attributes.isExperimental).to.be.true;
    });

    it('responds with correct rule log data', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const ruleLogs: advanceApprovalSerializers.IAdvanceRuleLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-rule-log',
      );

      expect(ruleLogs).to.have.length(3);

      expect(ruleLogs.find(log => log.attributes.name === 'bankDisconnected').attributes.success).to
        .be.true;
      expect(ruleLogs.find(log => log.attributes.name === 'hasInitialPull').attributes.success).to
        .be.true;
      expect(
        ruleLogs.find(log => log.attributes.name === 'historicalPaydaySolvency').attributes.success,
      ).to.be.true;
    });

    it('includes historical rule log data', async () => {
      await sequelize.query(
        `
        INSERT INTO advance_rule_log (advance_approval_id, success, node_name, rule_name)
        VALUES (${advanceApproval.id}, true, '${NodeNames.EligibilityNode}', 'oldData')
      `,
        { type: QueryTypes.INSERT },
      );

      const {
        body: { included },
      } = await withInternalUser(req);

      const ruleLogs: advanceApprovalSerializers.IAdvanceRuleLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-rule-log',
      );

      expect(ruleLogs).to.have.length(4);

      expect(ruleLogs.find(log => log.attributes.name === 'oldData').attributes.success).to.be.true;
    });

    it('responds with correct recurring transaction data', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const [
        serializedRecurringTransaction,
      ]: recurringTransactionSerializers.IRecurringTransactionResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'recurring-transaction',
      );

      expect(serializedRecurringTransaction.attributes.name).to.equal(
        recurringTransaction.userDisplayName,
      );
    });

    it('responds with correct bank account data', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const [serializedBankAccount]: [
        bankAccountSerializers.IBankAccountResource,
      ] = included.filter((resource: IApiResourceObject) => resource.type === 'bank-account');

      expect(serializedBankAccount.attributes.displayName).to.equal(bankAccount.displayName);
    });
  });

  describe('failed approval', () => {
    beforeEach(async () => {
      advanceApproval = await factory.create('advance-approval', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        recurringTransactionId: recurringTransaction.id,
        approved: false,
        approvedAmounts: [],
      });

      await factory.create('advance-node-log', {
        name: NodeNames.EligibilityNode,
        success: false,
        successNodeName: NodeNames.PaydaySolvencyNode,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-rule-log', {
        ruleName: 'bankDisconnected',
        nodeName: NodeNames.EligibilityNode,
        success: true,
        advanceApprovalId: advanceApproval.id,
      });

      await factory.create('advance-rule-log', {
        ruleName: 'hasInitialPull',
        nodeName: NodeNames.EligibilityNode,
        success: false,
        advanceApprovalId: advanceApproval.id,
        error: 'no initial pull',
        data: {
          isEligibleForExperiment: false,
        },
      });

      req = request(app)
        .get(`/v2/advance-approvals/${advanceApproval.id}`)
        .expect(200);
    });

    it('responds with correct approval data', async () => {
      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data.attributes.approved).to.be.false;
      expect(data.attributes.approvedAmounts).to.be.empty;
    });

    it('responds with null next node', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const nodeLogs: advanceApprovalSerializers.IAdvanceNodeLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-node-log',
      );

      expect(nodeLogs).to.have.length(1);

      const {
        attributes: eligibilityNodeAttributes,
        relationships: eligibilityNodeRelationships,
      } = nodeLogs.find(log => log.attributes.name === NodeNames.EligibilityNode);

      expect(eligibilityNodeAttributes.success).to.be.false;

      expect(Object.keys(eligibilityNodeRelationships)).to.have.length(3);

      expect(eligibilityNodeRelationships.nextNodeLog.data).to.be.null;
      expect(eligibilityNodeRelationships.advanceRuleLogs.data).to.have.length(2);
    });

    it('responds with correct rule log data', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const ruleLogs: advanceApprovalSerializers.IAdvanceRuleLogResource[] = included.filter(
        (resource: IApiResourceObject) => resource.type === 'advance-rule-log',
      );

      expect(ruleLogs).to.have.length(2);

      const bankDisconnectedRuleLog = ruleLogs.find(
        log => log.attributes.name === 'bankDisconnected',
      );
      const hasInitialPullRuleLog = ruleLogs.find(log => log.attributes.name === 'hasInitialPull');

      expect(bankDisconnectedRuleLog.attributes.success).to.be.true;
      expect(hasInitialPullRuleLog.attributes.success).to.be.false;
      expect(hasInitialPullRuleLog.attributes.error).to.equal('no initial pull');
      expect(hasInitialPullRuleLog.attributes.data).to.deep.eq({
        isEligibleForExperiment: false,
      });
    });
  });

  describe('No recurring transaction', () => {
    beforeEach(async () => {
      advanceApproval = await factory.create('advance-approval', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        approved: true,
      });

      req = request(app)
        .get(`/v2/advance-approvals/${advanceApproval.id}`)
        .expect(200);
    });

    it('responds with correct approval data', async () => {
      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data.relationships.recurringTransaction.data).to.be.null;
    });

    it('does not include null in response', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      expect(included.some((resource: IApiResourceObject) => resource === null)).to.be.false;
    });
  });

  describe('Soft deleted recurring transaction', () => {
    beforeEach(async () => {
      const softDeletedRecurringTransaction = await factory.create('recurring-transaction', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        deleted: moment(),
      });

      advanceApproval = await factory.create('advance-approval', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        approved: true,
        recurringTransactionId: softDeletedRecurringTransaction.id,
      });

      req = request(app)
        .get(`/v2/advance-approvals/${advanceApproval.id}`)
        .expect(200);
    });

    it('responds with correct approval data', async () => {
      const {
        body: { data, included },
      } = await withInternalUser(req);

      validateRelationships(
        { data, included },
        {
          recurringTransaction: 'recurring-transaction',
        },
      );
    });
  });
});
