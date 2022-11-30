import * as request from 'supertest';
import app, { GetRulesPath } from '../../../src/services/advance-approval';
import { expect } from 'chai';
import {
  MAX_DAVE_SPENDING_ADVANCE_AMOUNT,
  MAX_STANDARD_ADVANCE_AMOUNT,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT,
  SOLVENCY_AMOUNT,
} from '../../../src/services/advance-approval/advance-approval-engine';
import { DaveBankingModelEligibilityNode } from '../../../src/services/advance-approval/advance-approval-engine/nodes';

describe('Get /rules', () => {
  it('should return advance engine rules static values', async () => {
    const result = await request(app)
      .get(GetRulesPath)
      .query({ isDaveBanking: false })
      .expect(200);

    expect(result.body.solvencyAmount).to.equal(SOLVENCY_AMOUNT);
    expect(result.body.minAccountAge).to.equal(60);
    expect(result.body.minAvgPaycheckAmount).to.equal(MINIMUM_APPROVAL_PAYCHECK_AMOUNT);
    expect(result.body.minAvailableBalance).to.equal(-75);
    expect(result.body.descriptions).to.eql([
      'I get paid in the account I connected',
      'My account currently has a positive balance',
      'My bank account is at least a few months old',
      "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
      'My paychecks average at least a few hundred dollars',
      'I keep enough money in my account for a few days after payday to pay a few bills',
    ]);
  });

  it('should return bank of dave numbers if has bank of dave', async () => {
    const result = await request(app)
      .get(GetRulesPath)
      .query({ isDaveBanking: true })
      .expect(200);

    expect(result.status).to.equal(200);
    expect(result.body.maxAdvanceAmount.daveSpending).to.eq(MAX_DAVE_SPENDING_ADVANCE_AMOUNT);
    expect(result.body.maxAdvanceAmount.externalAccount).to.eq(MAX_STANDARD_ADVANCE_AMOUNT);
    expect(result.body.solvencyAmount).to.equal(SOLVENCY_AMOUNT);
    expect(result.body.minAccountAge).to.equal(60);
    expect(result.body.minAvgPaycheckAmount).to.equal(DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT);
    expect(result.body.minDaveBankingMonthlyDD).to.equal(
      DaveBankingModelEligibilityNode.MonthlyIncomeMinimum,
    );
    expect(result.body.minAvailableBalance).to.equal(-75);
    expect(result.body.descriptions).to.eql([
      'I get paid in the account I connected',
      'My account currently has a positive balance',
      'My bank account is at least a few months old',
      "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
      'My paychecks average at least a few hundred dollars',
      'I keep enough money in my account for a few days after payday to pay a few bills',
    ]);
  });
});
