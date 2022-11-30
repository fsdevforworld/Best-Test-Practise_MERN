import { Job } from 'bull';
import JobManager from '../lib/job-manager';
import { moment } from '@dave-inc/time-lib';
import braze from '../lib/braze';
import amplitude from '../lib/amplitude';
import { BankAccount, BankConnection, Institution, User, Advance } from '../models';
import { AnalyticsEvent } from '../typings';
import { get } from 'lodash';
import { Op } from 'sequelize';

export type BroadcastBankDisconnectQueueData = {
  userId: number;
  institutionId: number;
  bankConnectionId: number;
  time: number;
};

async function run(job: Job<BroadcastBankDisconnectQueueData>): Promise<void> {
  const { bankConnectionId, time, userId, institutionId } = job.data;

  const bankConnection = await BankConnection.findByPk(bankConnectionId, {
    include: [User],
    paranoid: false,
  });
  if (bankConnection) {
    const { user } = bankConnection;
    const shouldBroadcast = await shouldBroadcastWhenDisconnected(bankConnection, user);
    if (!shouldBroadcast) {
      // TODO: Remove this check when users have the ability to manage
      // concurrent accounts.
      return;
    }
  }

  const occurredAt = moment(time);

  const institution = await Institution.findByPk(institutionId);
  const paybackUrl = await getAdvancePaybackUrl(bankConnectionId);

  const additionalData = {
    bankName: get(institution, 'displayName', 'Unknown'),
    paybackUrl,
  };

  const brazeEvent = {
    externalId: `${userId}`,
    name: AnalyticsEvent.BankDisconnected,
    time: occurredAt,
    properties: additionalData,
  };

  const amplitudeEvent = {
    eventType: AnalyticsEvent.BankDisconnected,
    userId: `${userId}`,
    eventProperties: additionalData,
    time: occurredAt.format('x'),
    insert_id: `${AnalyticsEvent.BankDisconnected}-${bankConnectionId}-${time}`,
  };

  await Promise.all([braze.track({ events: [brazeEvent] }), amplitude.track(amplitudeEvent)]);
}

export const BroadcastBankDisconnect = new JobManager<BroadcastBankDisconnectQueueData>(
  'broadcast-bank-disconnect',
  run,
  10,
);

async function shouldBroadcastWhenDisconnected(
  bankConnection: BankConnection,
  user: User,
): Promise<boolean> {
  if (!user.defaultBankAccountId) {
    return true;
  }

  const defaultBankAccount = await BankAccount.findByPk(user.defaultBankAccountId);
  const isDefaultBankConnection = get(defaultBankAccount, 'bankConnectionId') === bankConnection.id;
  return isDefaultBankConnection;
}

export async function getAdvancePaybackUrl(bankConnectionId: number): Promise<string> {
  const advance = await Advance.findOne({
    where: { outstanding: { [Op.gt]: 0 } },
    include: [
      {
        model: BankAccount,
        where: { bankConnectionId },
        required: true,
      },
    ],
  });

  return advance ? advance.getWebPaybackUrl() : null;
}
