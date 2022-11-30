import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import {
  PlaidInstitutionRefreshInterval,
  PlaidInstitutionStatus,
  PlaidInstitutionStatusDetails,
  PlaidInstitutionSubsystemStatus,
} from '../../typings/plaid';

import {
  InstitutionStatus,
  InstitutionStatusType,
  InstitutionSubsystemStatus,
} from '@dave-inc/wire-typings';

const DEFAULT_INSTITUTION_SUBSYSTEM_STATUS: InstitutionSubsystemStatus = {
  login: {
    type: InstitutionStatusType.LOGIN,
    status: 'UNKNOWN',
  },
  transactions: {
    type: InstitutionStatusType.TRANSACTION,
    status: 'UNKNOWN',
  },
};

export default function format(
  institutionSubsystemStatus: PlaidInstitutionSubsystemStatus,
): InstitutionSubsystemStatus {
  const institutionStatuses = { ...DEFAULT_INSTITUTION_SUBSYSTEM_STATUS };
  const { item_logins, transactions_updates } = { ...institutionSubsystemStatus };

  if (item_logins) {
    const loginStatus = getLoginStatus(item_logins);
    institutionStatuses.login = loginStatus;
  }

  if (transactions_updates) {
    const transactionStatus = getTransactionStatus(transactions_updates);
    institutionStatuses.transactions = transactionStatus;
  }

  return institutionStatuses;
}

function getLoginStatus(itemLogins: PlaidInstitutionStatusDetails): InstitutionStatus {
  const { last_status_change, status } = { ...itemLogins };
  const { DOWN, DEGRADED } = PlaidInstitutionStatus;
  const lastStatusChange = moment(last_status_change)
    .tz(DEFAULT_TIMEZONE)
    .format('MM-DD-YYYY HH:mm:ss A Z');
  let message = null;

  if (status === DOWN) {
    message = 'Login Outage';
  } else if (status === DEGRADED) {
    message = 'Intermittent Login Failure';
  }

  return {
    status,
    message,
    lastStatusChange,
    type: InstitutionStatusType.LOGIN,
  };
}

function getTransactionStatus(
  transactionUpdates: PlaidInstitutionStatusDetails,
): InstitutionStatus {
  const { breakdown, last_status_change, status } = { ...transactionUpdates };
  const { refresh_interval } = breakdown;
  const { DOWN, DEGRADED, HEALTHY } = PlaidInstitutionStatus;
  const { DELAYED, STOPPED } = PlaidInstitutionRefreshInterval;
  const lastStatusChange = moment(last_status_change)
    .tz(DEFAULT_TIMEZONE)
    .format('MM-DD-YYYY HH:mm:ss A Z');
  let message = null;

  if (
    (status === DOWN && refresh_interval === DELAYED) ||
    (status === DOWN && refresh_interval === STOPPED) ||
    (status === DEGRADED && refresh_interval === STOPPED) ||
    (status === HEALTHY && refresh_interval === STOPPED)
  ) {
    message = `Missing transactions or transaction updates since ${lastStatusChange} PT`;
  }

  if (
    (status === DEGRADED && refresh_interval === DELAYED) ||
    (status === HEALTHY && refresh_interval === DELAYED)
  ) {
    message = `Initial and historical transaction updates have been delayed since ${lastStatusChange} PT`;
  }

  return {
    status,
    message,
    type: InstitutionStatusType.TRANSACTION,
    lastStatusChange,
    refreshInterval: refresh_interval,
  };
}
