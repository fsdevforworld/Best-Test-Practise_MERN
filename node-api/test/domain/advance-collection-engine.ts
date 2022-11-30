import { expect } from 'chai';

import { MAX_COLLECTION_ATTEMPTS } from '../../src/domain/collection';
import validateCollection from '../../src/domain/advance-collection-engine';
import { INVALID_ADVANCE_COLLECTION_TYPES } from '../../src/domain/advance-collection-engine/rules';
import { AdvanceCollectionTrigger } from '../../src/typings';

function buildAdvance(overrides?: any) {
  const defaults = {
    amount: 50,
    fee: 5,
    tip: 5,
    outstanding: 55,
    disbursementStatus: 'COMPLETED',
    collectionInProgress: true,
    paybackFrozen: false,
  };

  return Object.assign({}, defaults, overrides);
}

describe('Advance Collection Validation', () => {
  it('payment-too-large', async () => {
    const [failure] = await validateCollection(
      buildAdvance(),
      1000,
      1,
      AdvanceCollectionTrigger.DAILY_CRONJOB,
    );

    expect(failure.type).to.equal('payment-too-large');
  });

  it('payback-frozen', async () => {
    const [failure] = await validateCollection(
      buildAdvance({ paybackFrozen: true }),
      10,
      1,
      AdvanceCollectionTrigger.DAILY_CRONJOB,
    );

    expect(failure.type).to.equal('payback-frozen');
  });

  it('disbursement-not-complete', async () => {
    const [failure] = await validateCollection(
      buildAdvance({ disbursementStatus: 'PENDING' }),
      25,
      0,
      AdvanceCollectionTrigger.DAILY_CRONJOB,
    );

    expect(failure.type).to.equal('disbursement-not-complete');
  });

  describe('payment-too-small', () => {
    it('outstanding >= 5', async () => {
      const [failure] = await validateCollection(
        buildAdvance({ outstanding: 5 }),
        4,
        1,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failure.type).to.equal('payment-too-small');
    });

    it('outstanding < 5', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 3 }),
        3,
        1,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failures.length).to.equal(0);

      const [failure] = await validateCollection(
        buildAdvance({ outstanding: 3 }),
        2,
        1,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failure.type).to.equal('payment-too-small');
    });
  });

  describe('too-many-successful-collection-attempts', async () => {
    it('does not allow collection when there are alraedy four successful attempts', async () => {
      const [failure] = await validateCollection(
        buildAdvance(),
        25.0,
        MAX_COLLECTION_ATTEMPTS,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failure.type).to.equal('too-many-successful-collections');
    });

    it('allows collection when there are less than four', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        75.0,
        MAX_COLLECTION_ATTEMPTS - 1,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failures.length).to.equal(0);
    });

    it('allows collection when there are four but the trigger is "admin-manual-creation"', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        75.0,
        MAX_COLLECTION_ATTEMPTS,
        AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION,
      );

      expect(failures.length).to.equal(0);
    });

    it('allows collection when there are four but the trigger is "user"', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        75.0,
        MAX_COLLECTION_ATTEMPTS,
        AdvanceCollectionTrigger.USER,
      );

      expect(failures.length).to.equal(0);
    });

    it('allows collection when there are four but the trigger is "user-web"', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        75.0,
        MAX_COLLECTION_ATTEMPTS,
        AdvanceCollectionTrigger.USER_WEB,
      );

      expect(failures.length).to.equal(0);
    });

    it('allows collection when there are four but the trigger is  "user-one-time-card"', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        75.0,
        MAX_COLLECTION_ATTEMPTS,
        AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
      );

      expect(failures.length).to.equal(0);
    });
  });

  describe('payment-too-small-for-final-attempt', async () => {
    it('does not allow collection after three successful attempts, unless payment is for full outstanding amount', async () => {
      const [failure] = await validateCollection(
        buildAdvance({ outstanding: 60.0 }),
        55,
        MAX_COLLECTION_ATTEMPTS - 1,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(failure.type).to.equal('payment-too-small-for-final-attempt');
    });

    it('does not apply to manual payments', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 75.0 }),
        55,
        MAX_COLLECTION_ATTEMPTS - 1,
        AdvanceCollectionTrigger.USER_WEB,
      );

      expect(failures.length).to.equal(0);
    });
  });

  describe('collecting-another-advance', () => {
    it('does not collect when another collection is active', async () => {
      const [failure] = await validateCollection(
        buildAdvance({ outstanding: 50.0 }),
        50,
        0,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
        false,
      );

      expect(failure.type).to.equal(INVALID_ADVANCE_COLLECTION_TYPES.COLLECTING_ANOTHER_ADVANCE);
    });

    it('does collect for a manual trigger even if collection is not active', async () => {
      const failures = await validateCollection(
        buildAdvance({ outstanding: 50.0 }),
        50,
        0,
        AdvanceCollectionTrigger.USER,
        false,
      );

      expect(failures.length).to.equal(0);
    });
  });
});
