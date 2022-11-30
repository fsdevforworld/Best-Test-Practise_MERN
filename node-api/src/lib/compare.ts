import * as _ from 'lodash';
import { isMoment } from 'moment';
import { AuditLog } from '../models';
import { isTestEnv } from './utils';
import logger from './logger';

export type ArrayComparison =
  | [any, any]
  | {
      [index: number]: ObjectComparison[] | ArrayComparison;
    };

export type ObjectComparison = {
  [key: string]: ArrayComparison | ObjectComparison;
};

export function compareAndLog(
  expected: any,
  local: any,
  fields: string[] = [],
  userId: number,
  type: string,
): ObjectComparison | ArrayComparison | null {
  try {
    const diff = compareObjects(expected, local, fields);

    if (diff) {
      const error = new Error('compare and log');
      AuditLog.create({
        userId,
        type,
        message: 'COMPARE AND LOG FAILURE',
        successful: false,
        extra: {
          diff,
          expected,
          local,
          trace: error.stack,
        },
      });
    }

    return diff;
  } catch (err) {
    logger.error('Uncaught error in compare and log', { err });
  }
}

export function compareObjects(
  expected: any = {},
  local: any = {},
  fields: string[] = [],
): ObjectComparison | ArrayComparison | null {
  if (_.isArray(expected)) {
    return compareArray(expected, local, fields);
  }
  // loop through provided fields and check equality
  const diffs = _.reduce(
    fields,
    (result, key) => {
      if (isMoment(expected[key]) && isMoment(local[key])) {
        if (!_.isEqual(expected[key].format('YYYY-MM-DD'), local[key].format('YYYY-MM-DD'))) {
          result[key] = [expected[key].format('YYYY-MM-DD'), local[key].format('YYYY-MM-DD')];
        }
      } else if (!_.isEqual(local[key], expected[key])) {
        result[key] =
          _.isObject(local[key]) && _.isObject(expected[key])
            ? compareObjects(expected[key], local[key], Object.keys(expected))
            : [expected[key], local[key]];
      }
      return result;
    },
    {} as ObjectComparison,
  );

  if (!Object.keys(diffs).length) {
    return null;
  }

  return diffs;
}

export function compareArray(expected: any[], local: any[], fields: string[]): ArrayComparison {
  if (expected.length !== local.length) {
    return [expected, local];
  } else {
    const diffs = expected
      .map((x, i) => {
        return compareObjects(x, local[i], fields);
      })
      .filter(x => x !== null);
    if (diffs.length === 0) {
      return null;
    } else {
      return diffs;
    }
  }
}

export async function compareAndLogPromises(
  expected: Promise<any>,
  other: Promise<any>,
  fields: string[] = [],
  extra: any,
  userId: number,
  type: string,
): Promise<any> {
  // check result of other for failure
  let otherFailed = undefined;
  let otherResult = undefined;
  let expectedResult = undefined;
  let expectedFailed = undefined;

  try {
    otherResult = await other;
  } catch (err) {
    otherFailed = err;
  }

  // if testing we will return the other result
  if (!isTestEnv()) {
    // check for expected promise failure
    try {
      expectedResult = await expected;
    } catch (err) {
      expectedFailed = err;
    }

    try {
      // if they are both errors check the message
      if (otherFailed !== undefined && expectedFailed !== undefined) {
        let expectedMessage = expectedFailed.message;
        if (expectedMessage.split(':').length > 1) {
          expectedMessage = expectedMessage.split(':')[1];
        }
        let otherMessage = otherFailed.message;
        if (otherMessage.split(':').length > 1) {
          otherMessage = otherMessage.split(':')[1];
        }

        if (expectedMessage !== otherMessage) {
          AuditLog.create({
            userId,
            type,
            message: 'Compare promises both failed',
            successful: false,
            extra: {
              expectedMessage,
              otherMessage,
              extra,
            },
          });
        }
      } else if (otherFailed !== expectedFailed) {
        // if they are not the same log them
        AuditLog.create({
          userId,
          type,
          message: 'Compare promises one failed',
          successful: false,
          extra: {
            otherFailed,
            expectedFailed,
            extra,
          },
        });
      }

      // if we do not have a failure lets compare the results
      if (!expectedFailed) {
        compareAndLog(expectedResult, otherResult, fields, userId, type);

        return expectedResult;
      }
    } catch (err) {
      logger.error('Uncaught error in compareAndLogPromises', { err });
      return expected;
    }

    throw expectedFailed;
  }

  if (otherFailed) {
    throw otherFailed;
  }

  return otherResult;
}
