import { moment } from '@dave-inc/time-lib';
import { upsertBankTransactionForStubs } from './stub-bank-transaction-client';

export function insertFixtureBankTransactions() {
  fixtures.map(f => upsertBankTransactionForStubs(f));
}

const query2 = [
  [
    204,
    200,
    200,
    'external_204',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-07-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    205,
    200,
    200,
    'external_205',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-08-17',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    206,
    200,
    200,
    'external_206',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-08-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    207,
    200,
    200,
    'external_207',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-09-18',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-10-17 15:19:52',
  ],
  [
    208,
    200,
    200,
    'external_208',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-10-02',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-11-01 09:07:45',
  ],
  [
    209,
    200,
    200,
    'external_209',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-10-17',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-17 15:19:51',
    '2017-11-13 14:16:56',
  ],
  [
    210,
    200,
    200,
    'external_210',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-10-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-31 10:53:57',
    '2017-11-13 14:16:56',
  ],
  [
    211,
    201,
    200,
    'external_211',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-07-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    212,
    201,
    200,
    'external_212',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-08-17',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    213,
    201,
    200,
    'external_213',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-08-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    214,
    201,
    200,
    'external_214',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-09-15',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-10-17 15:19:52',
  ],
  [
    215,
    201,
    200,
    'external_215',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-09-29',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-11-01 09:07:45',
  ],
  [
    216,
    201,
    200,
    'external_216',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-10-17',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-17 15:19:51',
    '2017-11-13 14:16:56',
  ],
  [
    217,
    201,
    200,
    'external_217',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-10-31',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-31 10:53:57',
    '2017-11-13 14:16:56',
  ],
  [
    221,
    202,
    200,
    'external_221',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-07-28',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    222,
    202,
    200,
    'external_222',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-08-11',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    223,
    202,
    200,
    'external_223',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-08-25',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    224,
    202,
    200,
    'external_224',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-09-08',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-10-17 15:19:52',
  ],
  [
    225,
    202,
    200,
    'external_225',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-09-22',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-11-01 09:07:45',
  ],
  [
    226,
    202,
    200,
    'external_226',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-10-06',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-17 15:19:51',
    '2017-11-13 14:16:56',
  ],
  [
    227,
    202,
    200,
    'external_227',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-10-27',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-31 10:53:57',
    '2017-11-13 14:16:56',
  ],

  [
    231,
    203,
    200,
    'external_231',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-08-03',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    232,
    203,
    200,
    'external_232',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-08-10',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    233,
    203,
    200,
    'external_233',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-08-17',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    234,
    203,
    200,
    'external_234',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-08-24',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-10-17 15:19:52',
  ],
  [
    235,
    203,
    200,
    'external_235',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-09-07',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-11-01 09:07:45',
  ],
  [
    236,
    203,
    200,
    'external_236',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    '2017-09-14',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-17 15:19:51',
    '2017-11-13 14:16:56',
  ],
  [
    237,
    203,
    200,
    'external_237',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    '2017-09-21',
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-31 10:53:57',
    '2017-11-13 14:16:56',
  ],
].map(
  ([
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    pendingExternalName,
    pendingDisplayName,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    address,
    city,
    state,
    zipCode,
    plaidCategoryId,
    referenceNumber,
    ppdId,
    payeeName,
    created,
    updated,
  ]) => ({
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    pendingExternalName,
    pendingDisplayName,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    address,
    city,
    state,
    zipCode,
    plaidCategoryId,
    referenceNumber,
    ppdId,
    payeeName,
    created,
    updated,
  }),
);

const query3 = [
  [
    238,
    200,
    201,
    'external_238',
    'Dave, Inc DEBIT 5a2726b75d768369fcbc6238/Advance ID : 83338',
    'Dave, Inc DEBIT ID :',
    -75,
    '2017-08-01',
    false,
  ],
  [
    239,
    200,
    201,
    'external_239',
    'Dave, Inc DEBIT 5a2726b75d768369fcbc6238/Advance ID : 83337',
    'Dave, Inc DEBIT ID :',
    -75,
    '2017-07-16',
    false,
  ],
  [
    240,
    200,
    201,
    'external_240',
    'Dave, Inc DEBIT 5a2726b75d768369fcbc6238/Advance ID : 83336',
    'Dave, Inc DEBIT ID :',
    -75,
    '2017-07-01',
    false,
  ],
  [
    241,
    200,
    201,
    'external_241',
    'Dave, Inc DEBIT 5a2726b75d768369fcbc6238/Advance ID : 83335',
    'Dave, Inc DEBIT ID :',
    -75,
    '2017-06-01',
    false,
  ],
  [
    242,
    200,
    201,
    'external_242',
    'Dave, Inc DEBIT 5a2726b75d768369fcbc6238/Advance ID : 83334',
    'Dave, Inc DEBIT ID :',
    -75,
    '2017-05-01',
    false,
  ],
].map(
  ([
    id,
    userId,
    bankAccountId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  ]) => ({
    id,
    userId,
    bankAccountId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  }),
);

const query4 = [
  [
    243,
    410,
    1,
    'external_243',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    244,
    410,
    1,
    'external_244',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    245,
    410,
    1,
    'external_245',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:16',
    '2017-10-10 01:03:17',
  ],
  [
    246,
    410,
    1,
    'external_246',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-10-17 15:19:52',
  ],
  [
    247,
    410,
    1,
    'external_247',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-10 01:03:08',
    '2017-11-01 09:07:45',
  ],
  [
    248,
    410,
    1,
    'external_248',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.53,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-17 15:19:51',
    '2017-11-13 14:16:56',
  ],
  [
    249,
    410,
    1,
    'external_249',
    'DEPOSITORY',
    'CHECKING',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'PENDING CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF- 565087',
    'CREDIT FOR LENDING LABS INC PAYROLL CO REF-',
    3833.54,
    moment().format('YYYY-MM-DD'),
    0,
    null,
    null,
    null,
    null,
    '21009000',
    null,
    null,
    null,
    '2017-10-31 10:53:57',
    '2017-11-13 14:16:56',
  ],
].map(
  ([
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    pendingExternalName,
    pendingDisplayName,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    address,
    city,
    state,
    plaidCategoryId,
    plaidCategory,
    referenceNumber,
    ppdId,
    payeeName,
    created,
    updated,
  ]) => ({
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    pendingExternalName,
    pendingDisplayName,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    address,
    city,
    state,
    plaidCategoryId,
    plaidCategory,
    referenceNumber,
    ppdId,
    payeeName,
    created,
    updated,
  }),
);

const query5 = [
  [
    1250,
    1201,
    1200,
    'external_1250',
    'Dave Inc CREDIT',
    'Dave Inc CREDIT',
    0.03,
    moment()
      .subtract(1, 'day')
      .format('YYYY-MM-DD'),
    true,
  ],
  [
    1251,
    1201,
    1200,
    'external_1251',
    'Dave Inc CREDIT',
    'Dave Inc CREDIT',
    0.06,
    moment()
      .subtract(1, 'day')
      .format('YYYY-MM-DD'),
    true,
  ],
].map(
  ([
    id,
    bankAccountId,
    userId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  ]) => ({
    id,
    bankAccountId,
    userId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  }),
);

const query6 = [
  [
    2201,
    2200,
    2200,
    'external_2201',
    'Name 2200',
    'Name 2200',
    50,
    moment()
      .subtract(1, 'day')
      .format('YYYY-MM-DD'),
    true,
  ],
  [
    2202,
    2200,
    2200,
    'external_2202',
    'Name 2200',
    'Name 2200',
    -50,
    moment()
      .subtract(15, 'day')
      .format('YYYY-MM-DD'),
    true,
  ],
].map(
  ([
    id,
    bankAccountId,
    userId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  ]) => ({
    id,
    bankAccountId,
    userId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
  }),
);

const query7 = [
  [
    2310,
    1,
    1,
    'Random Transaction 1633164514682',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514682',
    'Random Transaction: 1533164514682',
    -77.17,
    '2018-07-08',
    0,
  ],
  [
    2320,
    1,
    1,
    'Random Transaction 1633164514688',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514688',
    'Random Transaction #1533164514688',
    -116.1,
    '2018-07-10',
    0,
  ],
  [
    2330,
    1,
    1,
    'Random Transaction 1633164514690',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514690',
    'Random Transaction - 1533164514690',
    -170.67,
    '2018-07-12',
    0,
  ],
  [
    2340,
    1,
    1,
    'Random Transaction 1633164514705',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514705',
    'Random Transaction . 1533164514705',
    -365.98,
    '2018-07-16',
    0,
  ],
  [
    2350,
    1,
    1,
    'Random Transaction 1633164514706',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514706',
    'Random Transaction 1533164514706',
    -49.97,
    '2018-07-17',
    0,
  ],
  [
    2610,
    2600,
    2600,
    'Random Transaction 1733164514682',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514682',
    'Random Transaction 1533164514682',
    -77.17,
    '${twoWeeksAgo}',
    0,
  ],
  [
    2620,
    2600,
    2600,
    'Random Transaction 1733164514688',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514688',
    'Random Transaction 1533164514688',
    -116.1,
    '${twoWeeksAgo}',
    0,
  ],
  [
    2630,
    2600,
    2600,
    'Random Transaction 1733164514690',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514690',
    'Random Transaction 1533164514690',
    -170.67,
    '${twoWeeksAgo}',
    0,
  ],
  [
    2640,
    2600,
    2600,
    'Random Transaction 1733164514705',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514705',
    'Random Transaction 1533164514705',
    -365.98,
    '${threeWeeksAgo}',
    0,
  ],
  [
    2650,
    2600,
    2600,
    'Random Transaction 1733164514706',
    'DEPOSITORY',
    'CHECKING',
    'Random Transaction 1533164514706',
    'Random Transaction 1533164514706',
    -49.97,
    '${threeWeeksAgo}',
    0,
  ],
].map(
  ([
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    displayName,
    externalName,
    amount,
    transactionDate,
    pending,
  ]) => ({
    id,
    bankAccountId,
    userId,
    externalId,
    accountType,
    accountSubtype,
    displayName,
    externalName,
    amount,
    transactionDate,
    pending,
  }),
);

const query1 = [
  [1, 1, 1, 'external_1', 'Name 1', 'Name 1', -50, '2017-05-01', false, null],
  [2, 1, 1, 'external_2', 'Name 2', 'Name 2', -50, '2017-05-02', false, null],
  [3, 3, 3, 'external_4', 'Name 2', 'Name 2', -50, '2017-08-01', false, null],
  [4, 3, 3, 'external_5', 'Name 3', 'Name 3', 150, '2017-08-01', false, null],
  [6, 22, 22, 'external_6', 'Name 6', 'Name 6', -20, moment(), false, null],
  [7, 22, 22, 'external_7', 'Name 7', 'Name 7', -8, moment(), true, null],
  [8, 22, 22, 'external_8', 'Name 8', 'Name 8', 30, moment().subtract(1, 'day'), false, null],
  [9, 22, 22, 'external_9', 'Name 9', 'Name 9', -50, moment().subtract(1, 'day'), false, null],
  [10, 22, 22, 'external_10', 'Name 10', 'Name 10', -20, moment().subtract(3, 'day'), false, null],
  [12, 22, 22, 'external_12', 'Name 12', 'Name 12', -25, moment().subtract(10, 'day'), false, null],
  [13, 22, 22, 'external_13', 'Name 13', 'Name 13', -15, moment().subtract(10, 'day'), false, null],
  [
    14,
    22,
    22,
    'external_14',
    'Name 14',
    'Name 14',
    -500,
    moment().subtract(12, 'day'),
    false,
    null,
  ],
  [15, 22, 22, 'external_15', 'Name 15', 'Name 15', 520, moment().subtract(13, 'day'), false, null],
  [16, 22, 22, 'external_16', 'Name 16', 'Name 16', -5, moment().subtract(20, 'day'), false, null],
  [17, 22, 22, 'external_17', 'Name 17', 'Name 17', -10, moment().subtract(21, 'day'), false, null],
  [18, 22, 22, 'external_18', 'Name 18', 'Name 18', -2, moment().subtract(2, 'day'), true, null],
  [
    19,
    31,
    31,
    'external_19',
    'Name 19',
    'Name 19',
    1200,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    20,
    31,
    31,
    'external_20',
    'Name 20',
    'Name 20',
    1000,
    moment().subtract(75, 'day'),
    false,
    null,
  ],
  [21, 3, 2, 'external_21', 'Name 21', 'Name 21', 1000, moment().subtract(15, 'day'), false, null],
  [22, 3, 2, 'external_22', 'Name 22', 'Name 22', 1000, moment().subtract(75, 'day'), false, null],
  [100, 100, 101, 'external_100', 'Name 100', 'Name 100', -20, moment(), true, null],
  [101, 100, 103, 'external_101', 'Name 101', 'Name 101', -20, moment(), true, null],
  [102, 100, 104, 'external_102', 'Name 102', 'Name 102', 100, moment(), true, null],
  [103, 100, 105, 'external_103', 'Name 103', 'Name 103', -20, moment(), true, null],
  [110, 110, 110, 'external_110', 'Name 110', 'Name 110', -1, moment(), false, null],
  [
    111,
    110,
    110,
    'external_111',
    'Name 111',
    'Name 111',
    -2,
    moment().subtract(7, 'day'),
    false,
    null,
  ],
  [112, 110, 110, 'external_112', 'Name 112', 'Name 112', -4, moment().add(7, 'day'), false, null],
  [113, 110, 111, 'external_113', 'Name 113', 'Name 113', -4, moment(), false, null],
  [115, 110, 111, 'external_115', 'Name 115', 'Name 115', -1, moment(), false, null],
  [
    116,
    110,
    111,
    'external_116',
    'Name 116',
    'Name 116',
    -1,
    moment().subtract(60, 'day'),
    false,
    null,
  ],
  [117, 110, 112, 'external_117', 'Name 117', 'Name 117', -1, moment(), false, null],
  [
    200,
    200,
    200,
    'external_200',
    'Name 200',
    'Name 200',
    1000,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    201,
    200,
    200,
    'external_201',
    'Name 201',
    'Name 201',
    1000,
    moment().subtract(75, 'day'),
    false,
    null,
  ],
  [
    202,
    200,
    201,
    'external_202',
    'Name 202',
    'Name 202',
    1000,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    203,
    200,
    201,
    'external_203',
    'Name 203',
    'Name 203',
    1000,
    moment().subtract(75, 'day'),
    false,
    null,
  ],
  [700, 701, 708, 'external_700', 'Name 700', 'Name 700', 1, moment(), false, null],
  [701, 701, 708, 'external_701', 'Name 701', 'Name 701', -5, moment(), false, null],
  [
    702,
    701,
    708,
    'external_702',
    'Name 702',
    'Name 702',
    4,
    moment().subtract(30, 'day'),
    false,
    null,
  ],
  [
    703,
    701,
    708,
    'external_703',
    'Name 703',
    'Name 703',
    8,
    moment().subtract(30, 'day'),
    false,
    null,
  ],
  [704, 701, 708, 'external_704', 'Name 700', 'Name 700', 1, moment(), false, null],
  [705, 701, 708, 'external_705', 'Name 701', 'Name 701', -5, moment(), false, null],
  [
    706,
    701,
    708,
    'external_706',
    'Name 702',
    'Name 702',
    4,
    moment().subtract(30, 'day'),
    false,
    null,
  ],
  [
    707,
    701,
    708,
    'external_707',
    'Name 703',
    'Name 703',
    8,
    moment().subtract(30, 'day'),
    false,
    null,
  ],
  [
    708,
    701,
    708,
    'external_708',
    'Name 708',
    'Name 708',
    8,
    moment().subtract(61, 'day'),
    false,
    null,
  ],
  [
    1100,
    1100,
    1100,
    'external_1100',
    'Name 1100',
    'Name 1100',
    -1000,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    1101,
    1100,
    1100,
    'external_1101',
    'Name 1101',
    'Name 1101',
    -1001,
    moment().subtract(60, 'day'),
    false,
    null,
  ],
  [
    1102,
    1100,
    1100,
    'external_1102',
    'Name 1102',
    'Name 1102',
    1002,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    1103,
    1100,
    1100,
    'external_1103',
    'Name 1103',
    'Name 1103',
    1003,
    moment().subtract(60, 'day'),
    true,
    null,
  ],
  [1104, 1100, 1100, 'external_1104', 'Name 1104', 'Name 1104', -1500, moment(), true, 'Bacon 123'],
  [
    1200,
    1200,
    1200,
    'external_1200',
    'Name 1200',
    'Name 1200',
    -20,
    moment()
      .subtract(6, 'day')
      .format('YYYY-MM-06'),
    false,
    null,
  ],
  [1201, 1200, 1200, 'external_1201', 'Name 1201', 'Income', 1000, moment(), false, null],
  [
    1202,
    1200,
    1200,
    'external_1202',
    'Name 1201',
    'Income',
    1000,
    moment().subtract(15, 'day'),
    false,
    null,
  ],
  [
    1203,
    1200,
    1200,
    'external_1203',
    'Name 1203',
    'Bacon',
    -20,
    moment().startOf('month'),
    false,
    null,
  ],
  [
    1204,
    1200,
    1200,
    'external_1204',
    'Name 1203',
    'Bacon',
    -20,
    moment()
      .subtract(1, 'month')
      .startOf('month'),
    false,
    null,
  ],
  [
    1205,
    1200,
    1200,
    'external_1205',
    'Name 1203',
    'WOW',
    -20,
    moment()
      .subtract(3, 'month')
      .startOf('month'),
    false,
    null,
  ],
  [
    1206,
    1200,
    1200,
    'external_1206',
    'Name 1203',
    'WOW',
    -20,
    moment()
      .subtract(2, 'month')
      .startOf('month'),
    false,
    null,
  ],
  [
    1207,
    1200,
    1200,
    'external_1207',
    'Name BACON',
    'Name BACON',
    -20,
    moment()
      .subtract(6, 'day')
      .format('YYYY-MM-06'),
    false,
    null,
  ],
].map(
  ([
    id,
    userId,
    bankAccountId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    pendingDisplayName,
  ]) => ({
    id,
    userId,
    bankAccountId,
    externalId,
    externalName,
    displayName,
    amount,
    transactionDate,
    pending,
    pendingDisplayName,
  }),
);

const fixtures: any[] = query1
  .concat(query2)
  .concat(query3 as any[])
  .concat(query4)
  .concat(query5 as any[])
  .concat(query6 as any[])
  .concat(query7 as any[]);
