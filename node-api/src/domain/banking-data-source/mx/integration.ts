import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { get, flatMap } from 'lodash';

import MxDataSerializer from './data-serializer';

import {
  BankAccountResponse,
  BankingDataSourceErrorType,
  BankNexusResponse,
  BankTransactionResponse,
  MxConnectionStatus,
  MxMember,
  MxMemberConnectionStatus,
} from '../../../typings';

import { dogstatsd } from '../../../lib/datadog-statsd';
import mxClient from '../../../lib/mx';
import { isDevEnv, isStagingEnv, poll } from '../../../lib/utils';

import { BankingDataSourceError } from '../error';
import { BankingDataSourceIntegration } from '../integration-interface';
import logger from '../../../lib/logger';

export const MX_CONNECTED_STATUSES: string[] = [
  MxConnectionStatus.Connected,
  MxConnectionStatus.Reconnected,
];

enum MxAggregationTrigger {
  InitialConnection = 'INITIAL_CONNECTION',
  Balance = 'BALANCE',
  Verification = 'VERIFICATION',
}

enum MxAggregationPollMode {
  UntilFullyAggregated,
  UntilAccountsAreProcessed,
}

export default class MxIntegration extends BankingDataSourceIntegration {
  public readonly serializer = MxDataSerializer;
  protected readonly client = mxClient;
  protected readonly userGuid: string;
  protected readonly memberGuid: string;

  /**
   * Builds client responsible for interacting with an MX bank integration
   *
   * @param {string} userGuid
   * @param {string} memberGuid
   */
  public constructor(userGuid: string, memberGuid: string) {
    super();

    this.userGuid = userGuid;
    this.memberGuid = memberGuid;
  }

  /**
   * Fetches all accounts associated with an Mx user
   *
   * @returns {Promise<BankAccountResponse[]>}
   */
  public async getAccounts(): Promise<BankAccountResponse[]> {
    const request = (async () => {
      const { body: readMemberStatusBody } = await this.client.members.readMemberStatus(
        this.memberGuid,
        this.userGuid,
      );
      const member = readMemberStatusBody.member;
      if (!member) {
        throw new Error('Mx read member status response did not include member object');
      }

      // There is a chance the member is still being aggregated at this point from the initial bank connection
      // Since this is the first mx api call in our connection flow, we need to poll until completion in order to get account information
      if (member.isBeingAggregated) {
        await this.pollUntilMemberIsConnected(member, {
          trigger: MxAggregationTrigger.InitialConnection,
          mode: MxAggregationPollMode.UntilFullyAggregated,
        });
      }

      return this.client.members.listMemberAccounts(this.memberGuid, this.userGuid);
    })();

    const { body } = await this.makeRequest(request, 'get_accounts');

    return this.serializer.serializeBankAccounts(body.accounts);
  }

  /**
   * Fetches account and routing number information for a given Mx bank account
   * MX has two different API calls to fetch account / routing numbers, so we will fetch both information in parallel
   *
   * @returns {Promise<BankAccountResponse>}
   */
  public async getAccountsWithAccountAndRouting(): Promise<BankAccountResponse[]> {
    const request = Promise.all([
      this.client.members.listMemberAccounts(this.memberGuid, this.userGuid),
      (async () => {
        const { body: readMemberStatusBody } = await this.client.members.readMemberStatus(
          this.memberGuid,
          this.userGuid,
        );
        const member = readMemberStatusBody.member;
        if (!member) {
          throw new Error('Mx read member status response did not include member object');
        }

        // There is a chance the member is still being aggregated at this point from the initial bank connection
        // We need to trigger a verification job to pull account/routing numbers
        // Since mx only allows one job to run at time (or they will throw an un-descriptive 409 error),
        // we need to wait for the initial aggregation to fully finish first
        if (member.isBeingAggregated) {
          await this.pollUntilMemberIsConnected(member, {
            trigger: MxAggregationTrigger.InitialConnection,
            mode: MxAggregationPollMode.UntilFullyAggregated,
          });
        }
        await this.triggerVerificationAndPollUntilComplete();

        return this.client.verification.listAccountNumbers(this.memberGuid, this.userGuid);
      })(),
    ]);

    const [
      { body: listMemberAccountsBody },
      { body: listAccountNumbersBody },
    ] = await this.makeRequest(request, 'get_accounts_with_account_and_routing');

    return this.serializer.serializeBankAccounts(
      listMemberAccountsBody.accounts,
      // Temporarily stubbing account numbers for dev/staging environments TODO - remove when MX fixes sandbox
      isDevEnv() || isStagingEnv()
        ? listMemberAccountsBody.accounts.map(account => {
            const accountNumbers = listAccountNumbersBody.accountNumbers.find(
              ({ accountGuid }) => accountGuid === account.guid,
            );

            return {
              accountGuid: account.guid,
              accountNumber:
                get(accountNumbers, 'accountNumber') || `${account.guid}-fake-account-number`,
              routingNumber:
                get(accountNumbers, 'routingNumber') || `${account.guid}-fake-routing-number`,
              memberGuid: account.memberGuid,
              userGuid: account.userGuid,
            };
          })
        : listAccountNumbersBody.accountNumbers,
    );
  }

  /**
   * Mx doesn't have a specific balance API,
   * Instead, we trigger an aggregation call (async task on their end to re-sync the bank connection)
   * and poll them until it's done
   *
   * @param {string[]} accountIds
   * @returns {Promise<BankAccountResponse[]>}
   */
  public async getBalance(accountIds?: string[]): Promise<BankAccountResponse[]> {
    const request = (async () => {
      await this.triggerAggregationAndPollUntilComplete();

      return this.client.members.listMemberAccounts(this.memberGuid, this.userGuid);
    })();

    const { body } = await this.makeRequest(request, 'get_balance');

    return this.serializer
      .serializeBankAccounts(body.accounts)
      .filter(({ externalId }) => (accountIds ? accountIds.includes(externalId) : true));
  }

  /**
   * Fetches the bank connection object via the Mx Member API
   *
   * @returns {Promise<BankNexusResponse>}
   */
  public async getNexus(): Promise<BankNexusResponse> {
    const request = this.client.members.readMember(this.memberGuid, this.userGuid);

    const { body } = await this.makeRequest(request, 'get_nexus');

    return this.serializer.serializeNexus(body.member);
  }

  /**
   * Deletes a user's bank connection from Mx
   *
   * @returns {Promise<boolean>}
   */
  public async deleteNexus(): Promise<boolean> {
    const request = this.client.members.deleteMember(this.memberGuid, this.userGuid);

    await this.makeRequest(request, 'delete_nexus');

    return true;
  }

  /**
   * Fetches a list of a user's bank transactions from Mx, with options to filter by date, account ID, and pagination
   * MX API doesn't let us pass multiple account IDs, so instead we will make separate requests per account ID in parallel
   *
   * @param {string} startDate
   * @param {string} endDate
   * @param {string[]} accountIds
   * @param {{perPage: number, pageNumber: number}} options
   * @param {BankTransactionResponse[]} accumulator
   * @returns {Promise<BankTransactionResponse[]>}
   */
  public async getTransactions(
    startDate: string,
    endDate: string,
    accountIds: string[],
    options: { perPage: number; pageNumber: number },
    accumulator?: BankTransactionResponse[],
  ): Promise<BankTransactionResponse[]> {
    // MX starts at page 1, not 0
    const page = options.pageNumber + 1;

    const request = Bluebird.map(
      accountIds,
      async accountId => {
        return this.client.accounts.listAccountTransactions(
          accountId,
          this.userGuid,
          startDate,
          endDate,
          page,
          options.perPage,
        );
      },
      { concurrency: 2 },
    );

    const transactionResponses = await this.makeRequest(request, 'get_transactions');

    return this.serializer.serializeTransactions(
      flatMap(transactionResponses, transactionResponse => transactionResponse.body.transactions),
    );
  }

  /**
   * Handles kicking off an aggregation task to MX, handling re-syncing member account information
   * And continuously poll the connection status endpoint every 3 seconds to check for completion
   *
   * @returns {Promise<MemberConnectionStatus>}
   */
  private async triggerAggregationAndPollUntilComplete(): Promise<MxMemberConnectionStatus> {
    const { body: aggregateMemberBody } = await this.client.members.aggregateMember(
      this.memberGuid,
      this.userGuid,
    );

    if (!aggregateMemberBody.member) {
      throw new Error('Mx aggregate member response did not include member object');
    }

    return this.pollUntilMemberIsConnected(aggregateMemberBody.member, {
      trigger: MxAggregationTrigger.Balance,
      mode: MxAggregationPollMode.UntilFullyAggregated,
    });
  }

  /**
   * Handles kicking off an verification task to MX (very similar to aggregation)
   * And continuously poll the connection status endpoint every 3 seconds to check for completion
   *
   * @returns {Promise<MemberConnectionStatus>}
   */
  private async triggerVerificationAndPollUntilComplete(): Promise<MxMemberConnectionStatus> {
    const { body: verifyMemberBody } = await this.client.verification.verifyMember(
      this.memberGuid,
      this.userGuid,
    );

    if (!verifyMemberBody.member) {
      throw new Error('Mx verify member response did not include member object');
    }

    return this.pollUntilMemberIsConnected(verifyMemberBody.member, {
      trigger: MxAggregationTrigger.Verification,
      mode: MxAggregationPollMode.UntilFullyAggregated,
    });
  }

  /**
   * Continuously polls the connection status endpoint every 3 seconds to check if aggregation is completed
   *
   * If we detect that we are being throttled, we will error out
   * If aggregation doesn't complete for more than 60 seconds, we will error out
   * If we detect that the member is no longer connected, we will error out
   *
   * @param {MxMember} member
   * @param {MxAggregationTrigger} trigger
   * @param {MxAggregationPollMode} mode
   * @returns {Promise <MxMemberConnectionStatus>}
   */
  private async pollUntilMemberIsConnected(
    member: MxMember,
    { trigger, mode }: { trigger: MxAggregationTrigger; mode: MxAggregationPollMode },
  ): Promise<MxMemberConnectionStatus> {
    // MX will throttle us if we attempt to trigger an aggregation more than once within a 4 hour window
    // Currently, the only way to detect this is if isBeingAggregated is false
    if (!member.isBeingAggregated) {
      throw new BankingDataSourceError(
        'This member has already been aggregated in the last four hours.',
        BankingDataSource.Mx,
        member.connectionStatus,
        BankingDataSourceErrorType.RateLimitExceeded,
        { member },
      );
    }

    // Poll while aggregation is happening and accounts haven't been processed yet
    try {
      let pollAttempt = 0;
      const { body: readMemberStatusBody } = await poll(
        () => this.client.members.readMemberStatus(this.memberGuid, this.userGuid),
        {
          onSuccessfulPoll: async ({ body: connectionStatusBody }) => {
            dogstatsd.increment('mx.poll_member_connection_status', {
              trigger,
              pollAttempt: (++pollAttempt).toString(),
            });
            logger.info('[MX] Debugging aggregation polling', {
              trigger,
              pollAttempt,
              connectionStatusBody,
              memberGuid: this.memberGuid,
              userGuid: this.userGuid,
            });
          },
          shouldKeepPolling: ({ body: connectionStatusBody }) => {
            // Stop polling if member is disconnected
            if (!MX_CONNECTED_STATUSES.includes(connectionStatusBody.member.connectionStatus)) {
              return false;
            }

            switch (mode) {
              case MxAggregationPollMode.UntilFullyAggregated:
                return connectionStatusBody.member.isBeingAggregated;
              case MxAggregationPollMode.UntilAccountsAreProcessed:
              default:
                return (
                  connectionStatusBody.member.isBeingAggregated &&
                  !connectionStatusBody.member.hasProcessedAccounts
                );
            }
          },
          delayMs: 3000,
          timeoutMs: 60000,
        },
      );

      // Ensure member is still connected at this point
      const connectionStatus = readMemberStatusBody.member.connectionStatus as MxConnectionStatus;
      if (!MX_CONNECTED_STATUSES.includes(connectionStatus)) {
        const errorType = this.serializer.mapDisconnectedStatusToErrorType(connectionStatus);

        throw new BankingDataSourceError(
          'Member is not connected',
          BankingDataSource.Mx,
          connectionStatus,
          errorType,
          { member: readMemberStatusBody.member },
        );
      }

      return readMemberStatusBody.member;
    } catch (err) {
      if (err instanceof Bluebird.TimeoutError) {
        throw new BankingDataSourceError(
          'Timed out waiting for member aggregation to finish',
          BankingDataSource.Mx,
          '',
          BankingDataSourceErrorType.RequestTimedOut,
          { member },
        );
      }

      throw err;
    }
  }
}
