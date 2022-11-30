import * as Bluebird from 'bluebird';
import * as parse from 'csv-parse';
import { Tags } from 'hot-shots';
import { orderBy } from 'lodash';
import { dogstatsd } from '../../lib/datadog-statsd';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import SftpClient from '../../lib/sftp-client';
import { Advance, AuditLog, Payment, User } from '../../models';
import { Cron, DaveCron } from '../cron';
import { Tabapay } from '../../domain/transaction-settlement-processing/tabapay';
import logger from '../../lib/logger';
import getClient from '../../domain/bank-of-dave-internal-api';
import { IApiGetCardFunding } from '@dave-inc/banking-internal-api-client';
import {
  addCardFundingIntro,
  addCurrentCardFundingInfo,
  addOtherCardFundingInfo,
} from './bank-funding-chargeback-pdf';
import { addSubscriptionInfo, addUserInfo, createStandardPDF } from './base-chargeback-pdf';
import amplitude from '../../lib/amplitude';
import { AnalyticsEvent } from '../../typings';
import {
  addAdvancesIntro,
  addCurrentAdvanceInfo,
  addOtherAdvancesInfo,
  addPaymentAuthorization,
  addScreenshot,
} from './advance-chargeback-pdf';

type FileResult = {
  fileName: string;
  fileContents: string;
  fileSelectionRuleTitle: string;
};

enum Column {
  ACTION_STATUS = 'Action-Status',
  EXCEPTION_ID = 'Exception ID',
  EXCEPTION_TYPE = 'Exception type',
  EXCEPTION_DATE = 'Exception Date',
  EXCEPTION_DESCRIPTION = 'Exception Description',
  MERCHANT_REFERENCE_ID = 'Merchant Reference ID',
  ORIGINAL_TRANSACTION_ID = 'Original Transaction ID',
  ORIGINAL_SETTLEMENT_AMOUNT = 'Original Settled Amount',
  LAST_FOUR = 'Last 4',
  SUB_CLIENT_ID = 'MID',
}

enum ChargebackType {
  BANK_FUNDING = '0005',
}

const DISPUTE_CHARGEBACKS_METRIC_LABEL = 'dispute-chargebacks';

export const BankingInternalApiClient = getClient();

// I couldn't get Typescript to use the right signature for `parse()` so I wrote this.
const parseAsync = Bluebird.promisify((input: string, opts: parse.Options, cb: parse.Callback) =>
  parse(input, opts, cb),
);

async function writeAdvancesPdf(
  client: SftpClient,
  user: User,
  advance: Advance,
  payment: Payment,
  exception: any,
) {
  const userAdvances = await user.getAdvances();
  const doc = await createStandardPDF();
  await addAdvancesIntro(doc);
  await addUserInfo(doc, user, exception[Column.EXCEPTION_ID]);
  await addCurrentAdvanceInfo(doc, user, advance, payment, exception[Column.LAST_FOUR]);
  await addOtherAdvancesInfo(doc, userAdvances);
  await addSubscriptionInfo(doc, user);
  await addPaymentAuthorization(doc);
  await addScreenshot(doc, advance);
  if (advance.screenshotImage) {
    logger.info(`${exception[Column.EXCEPTION_ID]} has screenshot`);
  }
  doc.end();
  await uploadPDF(client, doc, exception);
}

async function writeBankFundingPDF(
  client: SftpClient,
  user: User,
  exception: any,
  cardFunding: IApiGetCardFunding,
) {
  const doc = await createStandardPDF();
  await addCardFundingIntro(doc);
  await addUserInfo(doc, user, exception[Column.EXCEPTION_ID]);
  await addCurrentCardFundingInfo(doc, cardFunding);
  try {
    const { data } = await BankingInternalApiClient.getBankAccountCardFundings(
      cardFunding.bankAccountId,
    );

    await addOtherCardFundingInfo(doc, data.cardFundings);
  } catch (error) {
    logger.error(`Failed to get card funding history for ${cardFunding.bankAccountId}`);
  }

  await addSubscriptionInfo(doc, user);
  await addPaymentAuthorization(doc);
  doc.end();

  await reportChargebackAnalytics(user, cardFunding, {
    exceptionId: exception[Column.EXCEPTION_ID],
    actionStatus: exception[Column.ACTION_STATUS],
    exceptionType: exception[Column.EXCEPTION_TYPE],
    exceptionDate: exception[Column.EXCEPTION_DATE],
    exceptionDescription: exception[Column.EXCEPTION_DESCRIPTION],
  });

  //TODO We may do more updates later, but for now we should see how these fair
  await uploadPDF(client, doc, exception);
}

async function uploadPDF(client: SftpClient, doc: PDFKit.PDFDocument, exception: any) {
  const dir = `${client.directory}/dispute-documentation/${moment().format('YYYY-MM-DD')}`;
  try {
    await client.client.list(dir);
  } catch (err) {
    if (err.message.includes('No such file')) {
      await client.client.mkdir(dir);
    } else {
      throw err;
    }
  }
  await client.client.put(doc, `${dir}/${exception[Column.EXCEPTION_ID]}.pdf`);
  dogstatsd.increment(`${DISPUTE_CHARGEBACKS_METRIC_LABEL}.pdfs-created`);
  logger.info(`Wrote ${exception[Column.EXCEPTION_ID]} pdf`);
}

async function reportChargebackAnalytics(
  user: User,
  data: IApiGetCardFunding,
  {
    actionStatus,
    exceptionType,
    exceptionDate,
    exceptionId,
    exceptionDescription,
  }: {
    actionStatus: string;
    exceptionType: string;
    exceptionDate: string;
    exceptionId: string;
    exceptionDescription: string;
  },
) {
  const amplitudeEvent = {
    eventType: AnalyticsEvent.DaveBankingDebitCardFundChargeback,
    userId: `${user.id}`,
    eventProperties: {
      type: data.type,
      transactionId: data.transactionId,
      exceptionId,
      loadAmount: data.loadAmount,
      feeAmount: data.feeAmount,
      isAvsMatch: data.isAvsMatch,
      actionStatus,
      exceptionType,
      exceptionDate,
      exceptionDescription,
    },
  };

  await amplitude.track(amplitudeEvent);
}

async function handleChargebackException(exception: Record<string, string>, client: SftpClient) {
  const subClientId = exception[Column.SUB_CLIENT_ID];
  const merchantReferenceId = exception[Column.MERCHANT_REFERENCE_ID];
  const originalTransactionId = exception[Column.ORIGINAL_TRANSACTION_ID];

  if (subClientId === ChargebackType.BANK_FUNDING) {
    try {
      const { data } = await BankingInternalApiClient.getByPaymentProcessorTransactionId(
        originalTransactionId,
      );
      const user = await User.findByPk(data.cardFunding.daveUserId);
      return writeBankFundingPDF(client, user, exception, data.cardFunding);
    } catch (error) {
      await AuditLog.create({
        userId: -1,
        type: 'DISPUTE_CHARGEBACK_NO_PAYMENT',
        message: 'No bank card funding found for the chargeback',
        successful: false,
        extra: {
          merchantReferenceId,
          originalTransactionId,
        },
      });
      throw new NotFoundError('Could not find bank card funding for chargeback');
    }
  } else {
    const payment = await Payment.findOne({
      where: {
        externalId: [merchantReferenceId, originalTransactionId],
      },
      include: [
        { model: Advance, paranoid: false },
        { model: User, paranoid: false },
      ],
      paranoid: false,
    });
    if (!payment) {
      await AuditLog.create({
        userId: -1,
        type: 'DISPUTE_CHARGEBACK_NO_PAYMENT',
        message: 'No payment found for the chargeback',
        successful: false,
        extra: {
          merchantReferenceId,
          originalTransactionId,
        },
      });
      throw new NotFoundError('Could not find payment for chargeback');
    }

    const { advance, user } = payment;
    const advanceTip = await advance.getAdvanceTip();
    const advanceAmountTotal = advance.amount + advance.fee + advanceTip.amount;

    if (advanceAmountTotal < payment.amount) {
      await AuditLog.create({
        userId: payment.userId,
        type: 'DISPUTE_CHARGEBACK_PAYMENT_HIGHER_THAN_ADVANCE',
        message: 'Payment amount was too high: more than total for advance',
        successful: false,
        extra: {
          advanceAmountTotal,
          chargebackPaymentAmount: payment.amount,
          merchantReferenceId,
          originalTransactionId,
        },
      });
      throw new InvalidParametersError('Payment amount was too high: more than total for advance');
    }

    return writeAdvancesPdf(client, user, advance, payment, exception);
  }
}

async function getChargebacksFiles(client: SftpClient): Promise<FileResult[]> {
  const fileSelectionRules = [
    {
      ruleFn: (fileName: string) =>
        fileName.startsWith('1000_400001') && fileName.includes('chargeback'),
      title: '1000_400001',
    },
    {
      ruleFn: (fileName: string) => fileName.startsWith('4002_') && fileName.includes('chargeback'),
      title: '4002_',
    },
  ];

  return Bluebird.map(fileSelectionRules, rule => getChargebacksFile(client, rule));
}

async function getChargebacksFile(
  client: SftpClient,
  fileSelectionRule: {
    ruleFn: (fileName: string) => boolean;
    title: string;
  },
): Promise<FileResult> {
  let fileResult: FileResult;
  let fileProcessingStatus: string;
  try {
    logger.info(`Processing rule ${fileSelectionRule.title}`);
    const files = await client.client.list(client.directory);
    const chargebackFiles = files.filter(file => fileSelectionRule.ruleFn(file.name));
    const chargebackFile = orderBy(chargebackFiles, 'name', 'desc')[0];
    logger.info(`Processing file ${chargebackFile.name}`);
    const fileBuffer = await client.client.get(`${client.directory}/${chargebackFile.name}`);
    fileResult = {
      fileName: chargebackFile.name,
      fileContents: fileBuffer.toString('utf8'),
      fileSelectionRuleTitle: fileSelectionRule.title,
    };
    fileProcessingStatus = 'success';
  } catch (ex) {
    logger.error('Error disputing chargebacks', { ex });
    // NOTE: Do not throw error so that we can process the other file still (because it's being processed via Bluebird.map which fails on first rejected promise)
    fileProcessingStatus = 'error_encountered';
  } finally {
    const tags = {
      file_processing_status: fileProcessingStatus,
      file_selection_title: fileSelectionRule.title,
    };
    dogstatsd.increment(`${DISPUTE_CHARGEBACKS_METRIC_LABEL}.files_processed`, tags);
  }
  return fileResult;
}

async function processFileContents(client: SftpClient, fileResult: FileResult): Promise<void> {
  if (!fileResult) {
    return;
  }

  logger.info(`Processing file contents for ${fileResult.fileName}`);
  const oldestDateWeCanDispute = moment().subtract('days', 45);

  let fileContents;
  try {
    fileContents = await parseAsync(fileResult.fileContents, {
      relax_column_count: true,
      trim: true,
      columns: true,
    });
  } catch (err) {
    logger.error(`Error parsing CSV file ${fileResult.fileName}, skipping file`, { err });
    return;
  }

  const exceptions = fileContents.filter((exc: any) => {
    const isChargeback = exc[Column.EXCEPTION_TYPE].toLowerCase() === 'chargeback';
    const isOpenStatus = exc[Column.ACTION_STATUS].toLowerCase().includes('open');

    const originalSettlementAmount = parseFloat(exc[Column.ORIGINAL_SETTLEMENT_AMOUNT]);
    const isNotSubscriptionCharge =
      !Number.isNaN(originalSettlementAmount) && originalSettlementAmount !== 1;
    const isNotTooOldToDispute = moment(exc[Column.EXCEPTION_DATE], 'MM/DD/YYYY').isSameOrAfter(
      oldestDateWeCanDispute,
      'day',
    );
    return isChargeback && isOpenStatus && isNotSubscriptionCharge && isNotTooOldToDispute;
  });
  logger.info(`Begin processing ${exceptions.length} chargebacks for ${fileResult.fileName}`);
  dogstatsd.increment(
    `${DISPUTE_CHARGEBACKS_METRIC_LABEL}.chargebacks_to_handle`,
    exceptions.length,
  );
  await Bluebird.map(
    exceptions,
    async (exc: any) => {
      let tags: Tags;
      try {
        logger.info('ABOUT TO HANDLE EXCEPTION');
        await handleChargebackException(exc, client);
        tags = {
          chargeback_status: 'chargeback_successfully_disputed',
        };
      } catch (err) {
        logger.error(`Error handling chargeback exception`, { exc, err });
        tags = {
          error_type: err.message,
          chargeback_status: 'error_handling_chargeback',
        };
      } finally {
        dogstatsd.increment(`${DISPUTE_CHARGEBACKS_METRIC_LABEL}.handle_chargeback`, tags);
      }
    },
    { concurrency: 1 },
  );
}

export async function run() {
  logger.info('RUNNING');

  const tabapaySftpConfig = new Tabapay();
  const client = new SftpClient(tabapaySftpConfig.sftpConfig);
  await client.connect();
  await Bluebird.map(getChargebacksFiles(client), fileResult =>
    processFileContents(client, fileResult),
  );
}

export const DisputeChargeBacks: Cron = {
  name: DaveCron.DisputeChargeBacks,
  process: run,
  schedule: '20 18 * * *',
};
