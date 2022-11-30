import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  addRuleDescriptions,
  getFormattedCaseName,
  MIN_ACCOUNT_AGE,
} from '../../../../src/services/advance-approval/advance-approval-engine';
import * as BuildEngine from '../../../../src/services/advance-approval/advance-approval-engine/build-engine';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../../../test-helpers';
import {
  AccountAgeNode,
  buildIncomeValidationNode,
  EligibilityNode,
  ExistingIncomeTimingNode,
  LowIncomeNode,
  PaydaySolvencyNode,
} from '../../../../src/services/advance-approval/advance-approval-engine/nodes';
import {
  AdvanceApprovalCreateResponse,
  ApprovalDict,
} from '../../../../src/services/advance-approval/types';
import { AdvanceType } from '@dave-inc/wire-typings';

describe('addRuleDescriptions', () => {
  [
    {
      contextDescription: 'experimental income validation node',
      includeSingleObservationIncome: true,
    },
    {
      contextDescription: 'control income validation node',
      includeSingleObservationIncome: false,
    },
  ].forEach(({ contextDescription, includeSingleObservationIncome }) => {
    context(contextDescription, () => {
      const sandbox = sinon.createSandbox();
      let approvalResponse: AdvanceApprovalCreateResponse;
      let dict: ApprovalDict;

      const eligibilityNode = new EligibilityNode();
      const accountAgeNode = new AccountAgeNode();
      const incomeValidationNode = buildIncomeValidationNode({ includeSingleObservationIncome });
      const existingIncomeTimingNode = new ExistingIncomeTimingNode();
      const lowIncomeNode = new LowIncomeNode();
      const paydaySolvencyNode = new PaydaySolvencyNode();

      const allCases = [
        ...eligibilityNode.cases,
        ...accountAgeNode.cases,
        ...incomeValidationNode.cases,
        ...lowIncomeNode.cases,
        ...paydaySolvencyNode.cases,
      ];

      before(() => clean(sandbox));
      beforeEach(async () => {
        await clean(sandbox);
        approvalResponse = {
          advanceType: AdvanceType.normalAdvance,
          approvedAmounts: [],
          created: moment().format(),
          paycheckDisplayName: 'Bacon',
          incomeValid: true,
          recurringTransactionId: 0,
          userId: 1,
          bankAccountId: 1,
          rejectionReasons: [],
          defaultPaybackDate: moment().ymd(),
          isExperimental: false,
          caseResolutionStatus: {},
          approved: true,
          advanceEngineRuleDescriptions: {
            passed: [],
            failed: [],
            pending: [],
          },
          id: 1,
          expired: false,
          expiresAt: moment()
            .add(1, 'day')
            .format(),
        };
        dict = { bankAccount: {} } as any;
      });
      afterEach(() => clean(sandbox));

      it('should return all vague descriptions if everything passes', async () => {
        allCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });
        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );

        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
          failed: [],
          pending: [],
        });
      });

      it('should return all vague descriptions with no failed descriptions if a case not in our list fails', async () => {
        const nodeCases = [
          ...eligibilityNode.cases,
          ...accountAgeNode.cases,
          ...incomeValidationNode.cases,
          ...existingIncomeTimingNode.cases,
        ];
        nodeCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
          ],
          failed: [],
          pending: [
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return all vague descriptions for Eligibility Node failure and no description in the failed list', async () => {
        const nodeCases = [...eligibilityNode.cases];
        nodeCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
          ],
          failed: [],
          pending: [
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return all vague descriptions for Eligibility Node failure if the hasInitialPull case failed', async () => {
        approvalResponse.caseResolutionStatus[EligibilityNode.hasInitialPull.name] = false;
        approvalResponse.caseResolutionStatus[
          EligibilityNode.hasEnoughBankAccountBalance.name
        ] = true;

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [],
          failed: ['I get paid in the account I connected'],
          pending: [
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return all vague descriptions for Eligibility Node failure if the hasEnoughBankAccountBalance case failed', async () => {
        approvalResponse.caseResolutionStatus[EligibilityNode.hasInitialPull.name] = true;
        approvalResponse.caseResolutionStatus[
          EligibilityNode.hasEnoughBankAccountBalance.name
        ] = false;

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: ['I get paid in the account I connected'],
          failed: ['My account currently has a positive balance'],
          pending: [
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return explicit descriptions for Eligibility Node failure and two nodes after it if the nodes get rearranged', async () => {
        const advanceApprovalEngine = new AccountAgeNode();
        advanceApprovalEngine
          .onSuccess(new EligibilityNode())
          .onSuccess(buildIncomeValidationNode({ includeSingleObservationIncome }))
          .onSuccess(new LowIncomeNode())
          .onSuccess(new PaydaySolvencyNode());
        sandbox.stub(BuildEngine, 'buildRulesApprovalFlow').returns(advanceApprovalEngine);

        accountAgeNode.cases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });
        approvalResponse.caseResolutionStatus[EligibilityNode.hasInitialPull.name] = false;
        approvalResponse.caseResolutionStatus[
          EligibilityNode.hasEnoughBankAccountBalance.name
        ] = true;

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );

        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: ['My bank account is at least a few months old'],
          failed: ['I get paid in the account I connected'],
          pending: [
            'My account currently has a positive balance',
            "I've gotten two paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return explicit description for Account Age Node failure and two nodes after it, everything else is vague', async () => {
        const eligibilityNodeCases = [...eligibilityNode.cases];
        eligibilityNodeCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const failingCases = [...accountAgeNode.cases];
        failingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = false;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
          ],
          failed: [`My bank account is at least ${MIN_ACCOUNT_AGE} days old`],
          pending: [
            "I've gotten two paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return explicit description for Income Validation Node failure and two nodes after it, everything else is vague', async () => {
        const passingCases = [...eligibilityNode.cases, ...accountAgeNode.cases];
        passingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const failingCases = [...incomeValidationNode.cases];
        failingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = false;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
          ],
          failed: [
            "I've gotten two paychecks deposited from the same employer on a regular schedule",
          ],
          pending: [
            'My paychecks average at least a few hundred dollars',
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return explicit description for Low Income Node failure and the rest of the nodes, everything else is vague', async () => {
        const passingCases = [
          ...eligibilityNode.cases,
          ...accountAgeNode.cases,
          ...incomeValidationNode.cases,
        ];
        passingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const failingCases = [...lowIncomeNode.cases];
        failingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = false;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );
        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
          ],
          failed: ['My paychecks average at least a few hundred dollars'],
          pending: [
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should use bank of dave low income amount if bank account is bank of dave', async () => {
        const passingCases = [
          ...eligibilityNode.cases,
          ...accountAgeNode.cases,
          ...incomeValidationNode.cases,
        ];
        passingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const failingCases = [...lowIncomeNode.cases];
        failingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = false;
        });
        dict = {
          bankAccount: { isDaveBanking: true },
        } as ApprovalDict;

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );

        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
          ],
          failed: ['My paychecks average at least a few hundred dollars'],
          pending: [
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
        });
      });

      it('should return explicit description for Payday Solvency Node failure and two nodes after it, everything else is vague', async () => {
        const passingCases = [
          ...eligibilityNode.cases,
          ...accountAgeNode.cases,
          ...incomeValidationNode.cases,
          ...lowIncomeNode.cases,
        ];
        passingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = true;
        });

        const failingCases = [...paydaySolvencyNode.cases];
        failingCases.forEach(nodeCase => {
          const caseName = getFormattedCaseName(nodeCase);
          approvalResponse.caseResolutionStatus[caseName] = false;
        });

        const advanceEngineRuleDescriptions = await addRuleDescriptions(
          approvalResponse.caseResolutionStatus,
          dict,
        );

        expect(advanceEngineRuleDescriptions).to.be.deep.eq({
          passed: [
            'I get paid in the account I connected',
            'My account currently has a positive balance',
            'My bank account is at least a few months old',
            "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            'My paychecks average at least a few hundred dollars',
          ],
          failed: [
            'I keep enough money in my account for a few days after payday to pay a few bills',
          ],
          pending: [],
        });
      });
    });
  });
});
