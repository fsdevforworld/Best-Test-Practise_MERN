import factory from '../factories';
import { FraudAlert, User } from '../../src/models';
import { performFraudCheck } from '../../src/jobs/handlers/perform-fraud-check';
import { expect } from 'chai';
import { clean } from '../test-helpers';
import { moment } from '@dave-inc/time-lib';

describe('Job: perform-fraud-check', () => {
  beforeEach(() => clean());

  const attributes = [
    {
      title: 'first name + last name',
      matchValues: { firstName: 'Fraud', lastName: 'LaFraud' },
      notMatchValues: { firstName: 'Freud', lastName: 'Slip' },
    },
    {
      title: 'phone number',
      matchValues: { phoneNumber: '+12133367340' },
      notMatchValues: { phoneNumber: '+12133367341' },
    },
    {
      title: 'email',
      matchValues: { email: 'match@dave.com' },
      notMatchValues: { email: 'notmatch@dave.com' },
    },
    {
      title: 'full address',
      matchValues: {
        addressLine1: '123 Cochran Street',
        addressLine2: 'APT 202',
        city: 'los angeles',
        state: 'CA',
        zipCode: '90026',
      },
      notMatchValues: {
        addressLine1: '123 Cochran Street',
        addressLine2: 'APT 202',
        city: 'los angeles',
        state: 'CA',
        zipCode: '90025',
      },
    },
    {
      title: 'phone number + last name + first name',
      matchValues: { phoneNumber: '+12334322178', lastName: 'Ditto', firstName: 'McDitto' },
      notMatchValues: { phoneNumber: '+12334322179', lastName: 'Ditto', firstName: 'McDitto' },
    },
    {
      title: 'email + last name + first name',
      matchValues: { email: 'ditto@dave.com', lastName: 'Ditto', firstName: 'McDitto' },
      notMatchValues: { email: 'diffditto@dave.com', lastName: 'Ditto', firstName: 'McDitto' },
    },
    {
      title: 'birthdate + last name + first name',
      matchValues: { birthdate: moment('2000-02-24'), lastName: 'Ditto', firstName: 'McDitto' },
      notMatchValues: { birthdate: moment('1977-05-24'), lastName: 'Ditto', firstName: 'McDitto' },
    },
    {
      title: 'address + last name + first name',
      matchValues: {
        addressLine1: '122 Cochran Street',
        addressLine2: 'APT 202',
        city: 'los angeles',
        state: 'CA',
        zipCode: '90026',
        lastName: 'John',
        firstName: 'W',
      },
      notMatchValues: {
        addressLine1: '123 Bundy Street',
        addressLine2: 'APT 203',
        city: 'santa monica',
        state: 'CA',
        zipCode: '90020',
        lastName: 'Chris',
        firstName: 'N',
      },
    },
    {
      title: 'address + birthdate',
      matchValues: {
        addressLine1: '122 Cochran Street',
        addressLine2: 'APT 202',
        city: 'los angeles',
        state: 'CA',
        zipCode: '90026',
        birthdate: moment('2005-05-25'),
      },
      notMatchValues: {
        addressLine1: '123 Bundy Street',
        addressLine2: 'APT 203',
        city: 'santa monica',
        state: 'CA',
        zipCode: '90020',
        birthdate: moment('2007-03-24'),
      },
    },
  ] as const;

  attributes.forEach(({ title, matchValues, notMatchValues }) => {
    describe(title, () => {
      it('matches and marks the user as fraud', async () => {
        const user = await factory.create<User>('user', {
          ...matchValues,
          fraud: false,
        });
        await factory.create('fraud-rule', matchValues);

        await performFraudCheck({ userId: user.id });

        await user.reload();
        const alert = await FraudAlert.findOne({ where: { userId: user.id } });

        expect(user.fraud).to.be.true;
        expect(alert).to.exist;
      });

      it('does not match', async () => {
        const user = await factory.create<User>('user', {
          ...notMatchValues,
          fraud: false,
        });
        await factory.create('fraud-rule', matchValues);

        await performFraudCheck({ userId: user.id });

        await user.reload();
        const alert = await FraudAlert.findOne({ where: { userId: user.id } });

        expect(user.fraud).to.be.false;
        expect(alert).to.null;
      });
    });
  });

  it('handles multi field rules', async () => {
    const firstName = 'John';
    const lastName = 'Smith';

    const [matched, unmatched] = await Promise.all([
      factory.create<User>('user', {
        firstName,
        lastName,
        fraud: false,
      }),
      factory.create<User>('user', {
        firstName: 'Bob',
        lastName,
      }),
    ]);

    await factory.create('fraud-rule', {
      firstName,
      lastName,
    });

    await Promise.all([
      performFraudCheck({ userId: matched.id }),
      performFraudCheck({ userId: unmatched.id }),
    ]);

    await Promise.all([matched.reload(), unmatched.reload()]);

    expect(matched.fraud).to.be.true;
    expect(unmatched.fraud).to.be.false;
  });

  it('handles casing differences', async () => {
    const user = await factory.create<User>('user', {
      lastName: 'Hawk',
      firstName: 'Tony',
      fraud: false,
    });
    await factory.create('fraud-rule', { lastName: 'hawk', firstName: 'tony' });

    await performFraudCheck({ userId: user.id });

    await user.reload();

    expect(user.fraud).to.be.true;
  });
});
