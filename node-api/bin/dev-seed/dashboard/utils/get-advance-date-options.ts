import { moment } from '@dave-inc/time-lib';

function getAdvanceDateOptions(date: string) {
  return {
    paybackDate: moment(date),
    created: moment(date).subtract(7, 'days'),
    createdDate: moment(date)
      .subtract(7, 'days')
      .format('YYYY-MM-DD'),
  };
}

export default getAdvanceDateOptions;
