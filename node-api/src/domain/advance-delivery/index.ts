import { moment } from '@dave-inc/time-lib';
import { Moment } from 'moment';
import { addBankingDaysForAch } from '../../lib/banking-days';
import { AdvanceDelivery, FeeResponse, PaymentProviderDelivery } from '@dave-inc/wire-typings';

export * from './payback-dates';

export function getExpectedDelivery(created: Moment | Date, advanceType: AdvanceDelivery): Moment {
  const createdMoment = moment(created);
  const expectedDelivery =
    advanceType === AdvanceDelivery.Express
      ? getRoundedTime(createdMoment)
      : addBankingDaysForAch(createdMoment).utc();
  return expectedDelivery;
}

export function getRoundedTime(dateTime: Moment): Moment {
  if (dateTime.minutes() < 30) {
    return moment(dateTime)
      .add(8, 'hours')
      .startOf('hour');
  } else {
    return moment(dateTime)
      .add(9, 'hours')
      .startOf('hour');
  }
}

/**
 * Determines the standard and express fees based on the provided advance amount
 *
 * @param {number} amount
 * @returns {FeeResponse}
 */
export function getFeesByAmount(amount: number): FeeResponse {
  if (amount <= 5) {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 1.99,
    };
  } else if (amount <= 15) {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 2.49,
    };
  } else if (amount <= 20) {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 2.99,
    };
  } else if (amount < 75) {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 3.99,
    };
  } else if (amount < 100) {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 4.99,
    };
  } else {
    return {
      [PaymentProviderDelivery.STANDARD]: 0,
      [PaymentProviderDelivery.EXPRESS]: 5.99,
    };
  }
}
