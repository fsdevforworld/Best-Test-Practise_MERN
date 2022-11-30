import {
  ABTestingEvent,
  AdminComment,
  AdminPaycheckOverride,
  Advance,
  AdvanceApproval,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AdvanceExperimentLog,
  AdvanceNodeLog,
  AdvanceRuleLog,
  Alert,
  AuditLog,
  BankAccount,
  BankConnection,
  BankTransaction,
  CampaignInfo,
  DaveBankingCallSession,
  EmailVerification,
  EmpyrEvent,
  ExpectedTransaction,
  FraudAlert,
  MembershipPause,
  OnboardingStep,
  Payment,
  PaymentMethod,
  PhoneNumberChangeRequest,
  RecurringTransaction,
  RedeemedSubscriptionBillingPromotion,
  RewardsLedger,
  SideHustleApplication,
  SubscriptionBilling,
  SubscriptionCollectionAttempt,
  SupportUserView,
  SynapsepayDocument,
  User,
  UserAppVersion,
  UserFeedback,
  UserIpAddress,
  UserNotification,
  UserRole,
  UserSession,
  UserSetting,
} from '../../src/models';
import { Model, ModelCtor } from 'sequelize';
import * as Bluebird from 'bluebird';
import logger from '../../src/lib/logger';
import { runTaskGracefully } from '../../src/lib/utils';
import * as fs from 'fs';
import { isNumber, isObject } from 'lodash';
import sendgridLib from '../../src/lib/sendgrid';
import * as archiver from 'archiver';

export const PII_USER_COLUMNS = [
  'firstName',
  'lastName',
  'phoneNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zipCode',
  'ssn',
  'email',
  'birthdate',
  'lowerFirstName',
  'lowerLastName',
  'lowerEmail',
  'lowerFullName',
];

function archive(directory: string, zipName: string) {
  return new Promise(async (res, rej) => {
    const output = fs.createWriteStream(zipName);
    const zip = archiver('zip');

    output.on('close', res);

    zip.on('error', rej);

    zip.pipe(output);

    zip.directory(directory, false);

    await zip.finalize();
  });
}

export async function ccpaDataRequest(userId: number, email: string) {
  const user = await User.findByPk(userId, { paranoid: false });

  if (!user) {
    logger.error(`No user found with id ${userId}`);
    process.exit(1);
  }

  const dirName = `./${user.id}-ccpa`;
  fs.mkdirSync(dirName);

  await dumpTable(User, [user], dirName, PII_USER_COLUMNS);

  await dumpNonUserIdTables(userId, dirName);

  await dumpUserIdTables(userId, dirName);

  const archivedFile = `./${user.id}-ccpa.zip`;
  await archive(dirName, archivedFile);

  await sendgridLib.sendHtml(
    `CCPA data for user ${user.id}`,
    'User data attached',
    email,
    undefined,
    undefined,
    [
      {
        content: await fs.readFileSync(archivedFile).toString('base64'),
        filename: archivedFile,
        type: 'application/zip',
        disposition: 'attachment',
      },
    ],
  );
}

async function dumpUserIdTables(userId: number, dirName: string) {
  const userIdClasses: Array<ModelCtor<Model<{ userId: number }>>> = [
    ABTestingEvent,
    Advance,
    AdminComment,
    AdminPaycheckOverride,
    AdvanceExperimentLog,
    Alert,
    AuditLog,
    BankTransaction,
    BankConnection,
    BankAccount,
    EmailVerification,
    EmpyrEvent,
    ExpectedTransaction,
    FraudAlert,
    MembershipPause,
    OnboardingStep,
    PhoneNumberChangeRequest,
    UserNotification,
    RecurringTransaction,
    SideHustleApplication,
    SupportUserView,
    SubscriptionBilling,
    SynapsepayDocument,
    UserAppVersion,
    UserFeedback,
    UserIpAddress,
    UserSession,
    UserSetting,
    AdvanceApproval,
    CampaignInfo,
    RedeemedSubscriptionBillingPromotion,
    RewardsLedger,
    UserRole,
    Payment,
    PaymentMethod,
  ];

  await Bluebird.each(userIdClasses, async uc => {
    const rows = await uc.findAll({ where: { userId }, paranoid: false });
    await dumpTable(uc, rows, dirName);
  });
}

async function dumpNonUserIdTables(userId: number, dirName: string) {
  const approvals = await AdvanceApproval.findAll({ where: { userId } });

  const nodeLogs: AdvanceNodeLog[] = [];
  const ruleLogs: AdvanceRuleLog[] = [];
  await Bluebird.each(approvals, async approval => {
    nodeLogs.push(...(await AdvanceNodeLog.findAll({ where: { advanceApprovalId: approval.id } })));
    ruleLogs.push(...(await AdvanceRuleLog.findAll({ where: { advanceApprovalId: approval.id } })));
  });
  await dumpTable(AdvanceNodeLog, nodeLogs, dirName);
  await dumpTable(AdvanceRuleLog, ruleLogs, dirName);

  await dumpTable(
    DaveBankingCallSession,
    await DaveBankingCallSession.findAll({
      where: {
        customerId: userId,
      },
    }),
    dirName,
  );

  const advances = await Advance.findAll({ where: { userId } });
  const collectionAttempts: AdvanceCollectionAttempt[] = [];
  const collectionSchedules: AdvanceCollectionSchedule[] = [];
  await Bluebird.each(advances, async advance => {
    collectionAttempts.push(
      ...(await AdvanceCollectionAttempt.findAll({
        where: { advanceId: advance.id },
      })),
    );
    collectionSchedules.push(
      ...(await AdvanceCollectionSchedule.findAll({
        where: { advanceId: advance.id },
      })),
    );
  });

  await dumpTable(AdvanceCollectionAttempt, collectionAttempts, dirName);
  await dumpTable(AdvanceCollectionSchedule, collectionSchedules, dirName);

  const subscriptions = await SubscriptionBilling.findAll({ where: { userId } });
  const subscriptionCollectionAttempts: SubscriptionCollectionAttempt[] = [];
  await Bluebird.each(subscriptions, async sub => {
    subscriptionCollectionAttempts.push(
      ...(await SubscriptionCollectionAttempt.findAll({
        where: { subscriptionBillingId: sub.id },
      })),
    );
  });
  await dumpTable(SubscriptionCollectionAttempt, subscriptionCollectionAttempts, dirName);
}

async function dumpTable(
  table: typeof Model,
  rows: any[],
  directory: string,
  filterColumns: string[] = [],
) {
  const tableName = table.getTableName();
  const columns = Object.keys(table.rawAttributes).filter(col => !filterColumns.includes(col));
  const header = columns.map(col => `"${col}"`).join(',') + '\n';
  const data = rows
    .map(row => {
      const json = row.toJSON();
      return columns
        .map(col => {
          const dat = json[col];
          if (isNumber(dat) || !dat) {
            return dat;
          } else if (isObject(dat)) {
            return `"${JSON.stringify(dat)}"`;
          } else {
            return JSON.stringify(dat);
          }
        })
        .join(',');
    })
    .join('\n');
  const dataWithHeader = header + data;
  fs.writeFileSync(`${directory}/${tableName}.csv`, dataWithHeader);
}

if (require.main === module) {
  if (process.argv.length < 4) {
    logger.error(
      'This command requires 2 arguments, the user id of which we will dump data for and an email to send the zipped data to.',
    );
    logger.error('E.G. ts-node ccpa-dump-user-data.ts 45');
    process.exit(1);
  }
  const userId = parseInt(process.argv[2], 10);
  if (!userId || isNaN(userId)) {
    logger.error('This script takes 1 argument which must be a userId.');
    process.exit(1);
  }

  const email = process.argv[3];

  runTaskGracefully(() => ccpaDataRequest(userId, email));
}
