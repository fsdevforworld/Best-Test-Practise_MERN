import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import factory from '../../factories';

import { ABTestingEvent, User } from '../../../src/models';

import { BankConnectionSourceExperiment } from '../../../src/domain/experiment';
import { ABTestingEventName, DeviceType } from '../../../src/typings';
import { clean } from '../../test-helpers';
import { MINIMUM_APP_VERSION_TO_BUCKET_MX } from '../../../src/domain/experiment/bank-connection-source-experiment';

describe('Bank Connection Source Experiment Domain', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('isUserBucketed', () => {
    it('should return false if user is not bucketed into anything', async () => {
      const user = await factory.create<User>('user');

      const result = await BankConnectionSourceExperiment.isUserBucketed(
        user.id,
        BankingDataSource.Mx,
      );

      expect(result).to.be.false;
    });

    it('should return false if user is not bucketed into the specified bucket', async () => {
      const user = await factory.create<User>('user');

      await factory.create('ab-testing-event', {
        userId: user.id,
        eventName: ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
      });

      const result = await BankConnectionSourceExperiment.isUserBucketed(
        user.id,
        BankingDataSource.Mx,
      );

      expect(result).to.be.false;
    });

    it('should return false if user is not bucketed into the specified bucket', async () => {
      const user = await factory.create<User>('user');

      await factory.create('ab-testing-event', {
        userId: user.id,
        eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
      });

      const result = await BankConnectionSourceExperiment.isUserBucketed(
        user.id,
        BankingDataSource.Plaid,
      );

      expect(result).to.be.false;
    });

    it('should return true if user is bucketed into the specified bucket', async () => {
      const user = await factory.create<User>('user');

      await factory.create('ab-testing-event', {
        userId: user.id,
        eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
      });

      const result = await BankConnectionSourceExperiment.isUserBucketed(
        user.id,
        BankingDataSource.Mx,
      );

      expect(result).to.be.true;
    });

    it('should return true if user is bucketed into the specified bucket', async () => {
      const user = await factory.create<User>('user');

      await factory.create('ab-testing-event', {
        userId: user.id,
        eventName: ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
      });

      const result = await BankConnectionSourceExperiment.isUserBucketed(
        user.id,
        BankingDataSource.Plaid,
      );

      expect(result).to.be.true;
    });
  });

  describe('bucketUser', () => {
    let createABTestingEventSpy: sinon.SinonSpy;

    beforeEach(() => {
      createABTestingEventSpy = sandbox.spy(ABTestingEvent, 'create');
    });

    it('should return the same bucket if a user is already bucketed', async () => {
      const abTestingEvent = await factory.create<ABTestingEvent>('ab-testing-event', {
        eventName: ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
      });

      const bucket = await BankConnectionSourceExperiment.bucketUser(abTestingEvent.userId, {
        appVersion: MINIMUM_APP_VERSION_TO_BUCKET_MX,
      });

      expect(bucket).to.eq(BankingDataSource.Plaid);
      sinon.assert.notCalled(createABTestingEventSpy);
    });

    it('should return the same bucket if a user is already bucketed', async () => {
      const abTestingEvent = await factory.create<ABTestingEvent>('ab-testing-event', {
        eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
      });

      const bucket = await BankConnectionSourceExperiment.bucketUser(abTestingEvent.userId, {
        appVersion: MINIMUM_APP_VERSION_TO_BUCKET_MX,
        deviceType: DeviceType.Android,
      });

      expect(bucket).to.eq(BankingDataSource.Mx);
      sinon.assert.notCalled(createABTestingEventSpy);
    });

    it('should not bucket user and return plaid if experiment limit is reached', async () => {
      const user = await factory.create<User>('user');

      sandbox
        .stub(ABTestingEvent, 'count')
        .withArgs({
          where: { eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment },
        })
        .returns(BankConnectionSourceExperiment.LIMIT_OF_USERS_TO_BUCKET_TO_MX);

      const bucket = await BankConnectionSourceExperiment.bucketUser(user.id, {
        appVersion: MINIMUM_APP_VERSION_TO_BUCKET_MX,
        deviceType: DeviceType.iOS,
      });

      expect(bucket).to.eq(BankingDataSource.Plaid);
      sinon.assert.notCalled(createABTestingEventSpy);
    });

    it('should not bucket user if not on minimum app version', async () => {
      const user = await factory.create<User>('user');

      const bucket = await BankConnectionSourceExperiment.bucketUser(user.id, {
        appVersion: '2.11.0',
        deviceType: DeviceType.iOS,
      });

      expect(bucket).to.eq(BankingDataSource.Plaid);
      sinon.assert.notCalled(createABTestingEventSpy);
    });

    it('should bucket user based on response of planout lib', async () => {
      const user = await factory.create<User>('user');

      const bucket = await BankConnectionSourceExperiment.bucketUser(user.id, {
        appVersion: semver.inc(MINIMUM_APP_VERSION_TO_BUCKET_MX, 'minor'),
      });

      expect(bucket).to.be.oneOf([BankingDataSource.Plaid, BankingDataSource.Mx]);
      sinon.assert.calledWith(createABTestingEventSpy, {
        userId: user.id,
        eventName:
          bucket === BankingDataSource.Plaid
            ? ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment
            : ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
      });
    });
  });
});
