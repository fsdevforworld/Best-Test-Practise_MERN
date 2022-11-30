import { expect } from 'chai';
import format from '../../../src/helper/institution-status/format';
import {
  PlaidInstitutionRefreshInterval,
  PlaidInstitutionStatus,
} from '../../../src/typings/plaid';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('InstitutionStatusHelper format', () => {
  before(() => clean());

  afterEach(() => clean());

  it('should return healthy status for both login and transaction', async () => {
    const plaidResponse = await factory.build('plaid_status_response_healthy');
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.NORMAL);
    expect(transactions.message).to.be.null;
  });

  it('should return login error if login status is down', async () => {
    const plaidResponse = await factory.build('plaid_status_response_unhealthy_login_down');
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.DOWN);
    expect(login.message).to.be.eq('Login Outage');
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.NORMAL);
    expect(transactions.message).to.be.null;
  });

  it('should return login error if login status is degraded', async () => {
    const plaidResponse = await factory.build('plaid_status_response_unhealthy_login_degraded');
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.DEGRADED);
    expect(login.message).to.be.eq('Intermittent Login Failure');
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.NORMAL);
    expect(transactions.message).to.be.null;
  });

  it('should return transaction error if transaction status is down and refresh interval is delayed', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_down_delayed',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.DOWN);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.DELAYED);
    expect(transactions.message).to.match(
      /Missing transactions or transaction updates since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return transaction error if transaction status is down and refresh interval is stopped', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_down_stopped',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.DOWN);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.STOPPED);
    expect(transactions.message).to.match(
      /Missing transactions or transaction updates since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return transaction error if transaction status is degraded and refresh interval is delayed', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_degraded_delayed',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.DEGRADED);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.DELAYED);
    expect(transactions.message).to.match(
      /Initial and historical transaction updates have been delayed since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return transaction error if transaction status is degraded and refresh interval is stopped', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_degraded_stopped',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.DEGRADED);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.STOPPED);
    expect(transactions.message).to.match(
      /Missing transactions or transaction updates since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return transaction error if transaction status is healthy and refresh interval is delayed', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_healthy_delayed',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.DELAYED);
    expect(transactions.message).to.match(
      /Initial and historical transaction updates have been delayed since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return transaction error if transaction status is healthy and refresh interval is stopped', async () => {
    const plaidResponse = await factory.build(
      'plaid_status_response_unhealthy_transaction_healthy_stopped',
    );
    const institutionStatus = format(plaidResponse.institution.status);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(login.message).to.be.null;
    expect(transactions.status).to.be.eq(PlaidInstitutionStatus.HEALTHY);
    expect(transactions.refreshInterval).to.be.eq(PlaidInstitutionRefreshInterval.STOPPED);
    expect(transactions.message).to.match(
      /Missing transactions or transaction updates since \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2} [A|P]M [-|+]\d{2}:\d{2} PT/,
    );
  });

  it('should return unknown status if no login or transaction status could be found', () => {
    const institutionStatus = format(null);
    const { login, transactions } = institutionStatus;
    expect(login.status).to.be.eq('UNKNOWN');
    expect(transactions.status).to.be.eq('UNKNOWN');
  });
});
