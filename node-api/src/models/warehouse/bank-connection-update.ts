import { moment } from '@dave-inc/time-lib';
import Snowflake from '../../lib/snowflake';
import { shallowMungeObjToCase } from '../../lib/utils';
import * as uuidV4 from 'uuid/v4';
import { BankConnectionUpdateType } from '../../typings';
import * as config from 'config';
import { recordEvent } from '../../domain/event/index';

export type BankConnectionUpdateCreate = {
  userId: number;
  bankConnectionId: number;
  successful?: boolean;
  type: string;
  extra?: any;
};

export type BankConnectionUpdate = {
  id: number;
  userId: number;
  bankConnectionId: number;
  successful?: boolean;
  type: string;
  extra: any;
  created: string;
  uuid: string;
};

const snowflakePubsubConfig: any = config.get('pubsub.snowflakePubsub');
const RECORD_TYPE = snowflakePubsubConfig.bankConnectionUpdate;

export function recordEventMessage(
  table: string,
  event: object,
  successful: boolean = null,
  extra: any = null,
) {
  return {
    table,
    data: shallowMungeObjToCase(
      {
        ...event,
        successful: typeof successful === 'boolean' ? { boolean: successful } : null,
        created: Snowflake.formatDatetime(moment()),
        extra: { string: JSON.stringify(extra || {}) },
        uuid: uuidV4(),
      },
      'snake',
    ),
  };
}

async function create(update: BankConnectionUpdateCreate): Promise<void> {
  await recordEvent.publish(
    recordEventMessage(RECORD_TYPE, update, update.successful, update.extra),
  );
}

async function getAllForUser(userId: number): Promise<BankConnectionUpdate[]> {
  const results = await Snowflake.query<BankConnectionUpdate>(
    `SELECT *
       FROM bank_connection_update
       WHERE user_id = :1
       ORDER BY id DESC
       LIMIT 1000`,
    [userId],
  );

  return results.map(bcu => {
    return shallowMungeObjToCase(bcu, 'camelCase');
  });
}

async function getBankConnectionDisconnects(
  userId: number,
  bankConnectionId: number,
): Promise<BankConnectionUpdate[]> {
  const results = await Snowflake.query<BankConnectionUpdate>(
    `SELECT *
       FROM bank_connection_update
       WHERE user_id = :1
       AND bank_connection_id = :2
       AND type = :3
       ORDER BY id DESC
       LIMIT 1000`,
    [userId, bankConnectionId, BankConnectionUpdateType.DISCONNECTED],
  );

  return results.map(bcu => {
    return shallowMungeObjToCase(bcu, 'camelCase');
  });
}

export default {
  getAllForUser,
  create,
  getBankConnectionDisconnects,
};
