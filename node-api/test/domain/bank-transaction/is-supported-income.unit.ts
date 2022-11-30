import { isSupportedIncome } from '../../../src/domain/bank-transaction';
import 'mocha';
import { expect } from 'chai';

describe('isSupportedIncome', () => {
  it('should return false if it matches our blacklist of cash deposits', () => {
    expect(isSupportedIncome('Jeff ATM Transaction', 10)).to.be.false;
  });

  it('should return false if it matches our blacklist of loan deposits', () => {
    expect(isSupportedIncome('some kinda EARNIN transaction', 10)).to.be.false;
  });

  it("should return true if it doesn't matches our blacklist of cash/loan deposits", () => {
    expect(isSupportedIncome('totally legit jeff transaction', 10)).to.be.true;
  });

  it("should return true it's a DAVE transaction with amounts higher than the max advance amount", () => {
    expect(isSupportedIncome('Dave', 201)).to.be.true;
  });

  it("should return false it's a DAVE transaction with amounts less than the max advance amount", () => {
    expect(isSupportedIncome('Dave', 75)).to.be.false;
  });

  it('should return false if the amount is an expense', () => {
    expect(isSupportedIncome('Jeff', -1)).to.be.false;
  });
});
