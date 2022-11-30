import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Config from 'config';

import {
  useTabapayRepaymentsACH,
  useTabapayDisbursementsACH,
} from '../../src/experiments/tabapay-ach';

describe.skip('TabapayAchExperiment', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe('useTabapayRepaymentsACH', () => {
    context('with userid override', () => {
      it('returns true', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.repaymentACH.overrides')
          .returns([123, 456]);

        expect(useTabapayRepaymentsACH(123)).to.be.true;
        expect(useTabapayRepaymentsACH(456)).to.be.true;
      });
    });

    context('with experiment set to 0 %', () => {
      it('returns false', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.repaymentACH.percent')
          .returns(0);

        expect(useTabapayRepaymentsACH(123)).to.be.false;
        expect(useTabapayRepaymentsACH(456)).to.be.false;
      });
    });

    context('with experiment set to 100%', () => {
      it('returns false', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.repaymentACH.percent')
          .returns(100);

        expect(useTabapayRepaymentsACH(123)).to.be.true;
        expect(useTabapayRepaymentsACH(456)).to.be.true;
      });
    });
  });

  describe('useTabapayDisbursementsACH', () => {
    context('with userid override', () => {
      it('returns true', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.disbursementACH.overrides')
          .returns([123, 456]);

        expect(useTabapayDisbursementsACH(123)).to.be.true;
        expect(useTabapayDisbursementsACH(456)).to.be.true;
      });
    });

    context('with experiment set to 0 %', () => {
      it('returns false', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.disbursementACH.percent')
          .returns(0);

        expect(useTabapayDisbursementsACH(123)).to.be.false;
        expect(useTabapayDisbursementsACH(456)).to.be.false;
      });
    });

    context('with experiment set to 100%', () => {
      it('returns false', () => {
        sandbox
          .stub(Config, 'get')
          .withArgs('tabapay.experiments.disbursementACH.percent')
          .returns(100);

        expect(useTabapayDisbursementsACH(123)).to.be.true;
        expect(useTabapayDisbursementsACH(456)).to.be.true;
      });
    });
  });
});
