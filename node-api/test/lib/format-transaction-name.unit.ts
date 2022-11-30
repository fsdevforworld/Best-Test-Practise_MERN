/* tslint:disable:only-arrow-functions */
import { formatDisplayName, formatExternalName } from '../../src/lib/format-transaction-name';
import { expect } from 'chai';
import * as changeCase from 'change-case';

function genTest(method: (t: any) => any, { input, output }: any) {
  it(`'${input}' => '${output}'`, () => {
    expect(method(input)).to.equal(output);
  });
}

describe('formatDisplayName', () => {
  const createTest = genTest.bind(null, formatDisplayName);

  [
    {
      input: 'KEEP THE CHANGE TRANSFER TO ACCT FOR',
      output: 'Keep The Change Transfer Acct',
    },
    {
      input: 'Online Banking transfer to CHK Confirmation#',
      output: 'Online Banking Transfer Chk',
    },
    {
      input: 'NSF: RETURNED ITEM FEE FOR ACTIVITY OF ELECTRONIC TRANSACTION POSTING DATE SEQ',
      output: 'Returned Item Fee',
    },
    {
      input: 'POS DEBIT DAVE.COM',
      output: changeCase.titleCase('DAVE.COM'),
    },
    {
      input: 'POS Debit - Visa Check Card RIL EXPRESS BLDG',
      output: changeCase.titleCase('Visa Check RIL EXPRESS BLDG'),
    },
    {
      input: 'ORIG CO NAME: D&A Services ENTRY DESCR: payment SEC:TEL IND ID:',
      output: changeCase.titleCase('D&A Services payment SEC:TEL IND'),
    },
    {
      input: 'Dave, Inc CREDIT WEB ID:',
      output: changeCase.titleCase('Dave, Inc CREDIT'),
    },
    {
      input:
        'INSUFFICIENT FUNDS FEE FOR A ITEM - DETAILS: PAYPAL ECHECK DSTIFFEND WEB ID: CLAIMID:',
      output: changeCase.titleCase(
        'INSUFFICIENT FUNDS FEE A ITEM - DETAILS: PAYPAL ECHECK DSTIFFEND',
      ),
    },
    {
      input: 'OASIS OUTSOURCIN PAYROLL PPD ID:',
      output: changeCase.titleCase('OASIS OUTSOURCIN PAYROLL'),
    },
    {
      input: 'CITI CARD ONLINE TYPE: PAYMENT ID: CITICTP CO:',
      output: changeCase.titleCase('CITI ONLINE'),
    },
    {
      input: 'ACH Withdrawal / NTB CITICTP ONLINE PMT',
      output: changeCase.titleCase('ACH Withdrawal / NTB ONLINE PMT'),
    },
    {
      input: 'ONLINE PMT BRANDSOURCE IDCITICTP',
      output: changeCase.titleCase('ONLINE PMT BRANDSOURCE'),
    },
    {
      input: 'ORIG CO NAME: USCG TREAS ENTRY DESCR: FED SAL SEC:PPD',
      output: changeCase.titleCase('USCG TREAS FED SAL'),
    },
    {
      input: 'BARCLAYS BANK DE  COLLECTION ACH Entry Memo Posted Today',
      output: changeCase.titleCase('BARCLAYS BANK DE COLLECTION ACH'),
    },
    {
      input: 'Paid NSF fee / Entry Class Code: PPD',
      output: changeCase.titleCase('Paid NSF fee / PPD'),
    },
    {
      input: 'ORIG CO NAME: ATT ENTRY DESCR:Payment SEC:PPD',
      output: changeCase.titleCase('ATT Payment'),
    },
    {
      input: 'AT&T ACH: COMPANY ID: SEC:TEL',
      output: changeCase.titleCase('AT&T ACH: SEC:TEL'),
    },
    {
      input: 'ONLINE TRANSFER FROM MMA TRANSACTION#:',
      output: changeCase.titleCase('ONLINE TRANSFER'),
    },
    {
      input: 'TST* YO MOMMA',
      output: changeCase.titleCase('YO MOMMA'),
    },
    {
      input: 'POS DEBIT TFI*TICKETFLY EVENTS',
      output: changeCase.titleCase('TICKETFLY EVENTS'),
    },
    {
      input: 'COCA COLA KINGSTON CA DOLLAR X (EXCHG RTE)',
      output: changeCase.titleCase('COCA COLA KINGSTON CA DOLLAR X'),
    },
    {
      input: 'ACH Dep: SF_REFUNDS TYPE: DIRECT PAY ID: CO: SF_REFUNDS',
      output: changeCase.titleCase('ACH Dep: SF_REFUNDS DIRECT SF_REFUNDS'),
    },
    {
      input: 'Paid NSF Fee / ACH Trace Number:',
      output: changeCase.titleCase('Paid NSF Fee /'),
    },
    {
      input: 'Deposit EarninActivehour / TYPE: PAYMENT ID: CO: ACH Trace Number:',
      output: changeCase.titleCase('Deposit EarninActivehour /'),
    },
  ].forEach(createTest);
});

describe('formatTransactionName', function() {
  const createTest = genTest.bind(null, formatExternalName);

  describe('title cases', function() {
    [
      { input: 'FAMILY DOLLAR', output: 'Family Dollar' },
      { input: 'DEPOSIT', output: 'Deposit' },
    ].forEach(createTest);
  });

  describe('names containing punctuation', function() {
    [
      { input: "McDonald's", output: "McDonald's" },
      { input: "Papa John's", output: "Papa John's" },
      { input: "Dunkin' Donuts", output: "Dunkin' Donuts" },
    ].forEach(createTest);
  });

  describe('commonly used proper nouns with strange capitalization', function() {
    [
      { input: 'iTunes', output: 'iTunes' },
      { input: 'Chick-fil-A', output: 'Chick-fil-A' },
      { input: 'MetroPCS', output: 'MetroPCS' },
      { input: 'AutoZone', output: 'AutoZone' },
    ].forEach(createTest);
  });

  describe('common names that start with a number', function() {
    [{ input: '7-Eleven', output: '7-Eleven' }].forEach(createTest);
  });

  describe('ordinals', function() {
    [{ input: '3rd Street Bakery', output: '3rd Street Bakery' }].forEach(createTest);
  });

  describe('special cases', function() {
    describe('Atm Withdrawal', function() {
      [
        {
          input: 'ATM WITHDRAWAL 007732 09/241301 75th',
          output: 'Atm Withdrawal',
        },
        {
          input: 'ATM WITHDRAWAL 006990 7/224165 FM19',
          output: 'Atm Withdrawal',
        },
        {
          input: 'ATM WITHDRAWAL 006025 04/1419507 I-4',
          output: 'Atm Withdrawal',
        },
      ].forEach(createTest);
    });

    createTest({
      input: 'NON-5/3 CASH WITHDRAWAL FEE',
      output: 'Cash Withdrawal Fee',
    });

    createTest({
      input: '35591 7-11 07/15 #000944301 PURCHASE 35591 7-11',
      output: '7-11',
    });

    describe('Uber transactions', function() {
      [
        {
          input: 'UBER *TRIP A4HKN CA 09/16',
          output: 'Uber',
        },
        {
          input: 'UBER *US JUL14 7MDF CA 07/15',
          output: 'Uber',
        },
        {
          input: 'UBER US DEC23 7MME',
          output: 'Uber',
        },
      ].forEach(createTest);
    });

    it('handles overdraft fees', function() {
      expect(
        formatExternalName(
          'OVERDRAFT ITEM FEE FOR ACTIVITY OF 08-28 ELECTRONIC TRANSACTION POSTING DATE 08-28-17 POSTING SEQ 00003',
        ),
      ).to.equal('Overdraft Fee');
    });

    it('handles returned item fees', function() {
      expect(
        formatExternalName(
          'NSF: RETURNED ITEM FEE FOR ACTIVITY OF 04-12 ELECTRONIC TRANSACTION POSTING DATE 04-12-17 POSTING SEQ 00001',
        ),
      ).to.equal('Returned Item Fee');
    });
  });

  describe('scrubs uuids', function() {
    describe('basic', function() {
      [
        { input: 'Basic Scrub Test 1234', output: 'Basic Scrub Test' },
        { input: 'Some Date 04/15 1234 Scrub', output: 'Some Date Scrub' },
        { input: '12345Please Scrub Me', output: 'Please Scrub Me' },
        { input: 'Testing1234 Go', output: 'Testing Go' },
        { input: 'STEAK-N-SHAKE#0245 99', output: 'Steak-N-Shake' },
      ].forEach(createTest);
    });

    describe('with prefix', function() {
      [
        {
          input: 'DEPOSIT WL DIGITAL CH#12345 VIA PAYPAL',
          output: 'Deposit Wl Digital Via Paypal',
        },
        {
          input: 'DEPOSIT XXXXX5019',
          output: 'Deposit',
        },
        {
          input: 'Deposit #502450',
          output: 'Deposit',
        },
        {
          input: 'CHECK 46 L083343468',
          output: 'Check',
        },
        {
          input: 'Activehours Activehour VISA DIRECT WI181487 08/26',
          output: 'Activehours Activehour Visa Direct',
        },
        {
          input: 'Mobile Banking Transfer Deposit <br>6573',
          output: 'Mobile Banking Transfer Deposit',
        },
        {
          input: '02/28BANKCARD DEPOSIT -0483202998',
          output: 'Bankcard Deposit',
        },
        {
          input: 'MCDONALD S F169 7000',
          output: 'Mcdonald S',
        },
        {
          input: 'Internet Transfer CREDIT TO DD 0040514700 06/11 09.22 #00616314094322670',
          output: 'Internet Transfer Credit To Dd',
        },
      ].forEach(createTest);
    });

    describe('prefix-like end of word', function() {
      createTest({
        input: 'Santa Monica Stixxx1235',
        output: 'Santa Monica Stixxx',
      });
    });

    describe('with a phrase', function() {
      [
        {
          input: 'Online Banking transfer to CHK 4050 Confirmation# 3144781503',
          output: 'Online Banking Transfer To Chk',
        },
        {
          input: 'KEEP THE CHANGE TRANSFER TO ACCT 9034 FOR 08/04/17',
          output: 'Keep The Change Transfer To Acct',
        },
        {
          input: 'Online Banking transfer from CHK 2062 Confirmation# 6534688775',
          output: 'Online Banking Transfer From Chk',
        },
        {
          input: 'Online Banking transfer from SAV 9034 Confirmation# 1225249521',
          output: 'Online Banking Transfer From Sav',
        },
        {
          input: 'CHECK # 4692',
          output: 'Check',
        },
        {
          input: 'DEPOSIT ID NUMBER 864621',
          output: 'Deposit',
        },
        {
          input: 'Hello Digit Inc. Savings PPD ID: 3461730710',
          output: 'Hello Digit Inc. Savings',
        },
        {
          input: 'CAPITAL ONE MOBILE PMT 708339809510431 WEB ID: 9279744980',
          output: 'Capital One Mobile Pmt',
        },
        {
          input: 'Payment to Chase card ending in 5381 09/27',
          output: 'Payment To Chase Card',
        },
        {
          input: 'TARGET DEBIT CRD ACH TRAN 000529400042572 POS ID: 1410215170',
          output: 'Target Debit Crd Ach Tran',
        },
        {
          input: '5/3 ONLINE TRANSFER FROM CK: XXXXXX7579 REF # 00484165144',
          output: 'Online Transfer From Ck:',
        },
      ].forEach(createTest);
    });

    describe('with a suffix', function() {
      [{ input: 'Foo MURPHY7643ATWA', output: 'Foo Murphy' }].forEach(createTest);
    });

    describe('with a phrase and prefix', function() {
      [
        {
          input: 'SAVE AS YOU GO TRANSFER DEBIT TO XXXXXXXXXXX7728',
          output: 'Save As You Go Transfer Debit',
        },
        {
          input: 'SAVE AS YOU GO TRANSFER CREDIT FROM XXXXXXXXXXX6918',
          output: 'Save As You Go Transfer Credit',
        },
        {
          input: 'KEEPTHECHANGE CREDIT FROM ACCT8970 EFFECTIVE 03/13',
          output: 'Keepthechange Credit',
        },
        {
          input: 'Online Transfer from CHK ...6057 transaction#: 5918763733',
          output: 'Online Transfer From Chk',
        },
        {
          input: 'MOBILE DEPOSIT : REF NUMBER :721030819478',
          output: 'Mobile Deposit',
        },
        {
          input: 'EB TO CHECKING # ******9708',
          output: 'Eb To Checking',
        },
        {
          input: 'DEBIT FOR CHECKCARD XXXXXX4306 07/06/17USA*CANTEEN',
          output: 'Usa*Canteen',
        },
        {
          input:
            'MONEY TRANSFER AUTHORIZED ON 04/27 FROM Activehours CA S387118045859528 CARD 7720',
          output: 'Money Transfer From Activehours Ca',
        },
      ].forEach(createTest);
    });

    describe('with a phrase, prefix and suffix', function() {
      [
        {
          input: 'TO ******6734 - USAA FUNDS TRANSFER DB',
          output: 'Usaa Funds Transfer Db',
        },
      ].forEach(createTest);
    });

    describe('with duplicate merchant name', function() {
      [
        {
          input: 'STATERBROS081 07/16 #000750609 PURCHASE STATERBROS081',
          output: 'Staterbros',
        },
      ].forEach(createTest);
    });

    describe('with debit card', function() {
      [
        {
          input: 'DEBIT FOR CHECKCARD XXXXXX6505 10/20/16RACETRAC134 00001347',
          output: 'Racetrac',
        },
        {
          input: 'DEBIT CARD PURCHASE XXXXX0396 STEAK-N-SHAKE#0245 Q99',
          output: 'Steak-N-Shake',
        },
      ].forEach(createTest);
    });

    describe('wrapped in parens', function() {
      createTest({
        input: 'RETURN OF POSTED CHECK / ITEM (RECEIVED ON 08-07) ELECTRONIC TRANSACTION',
        output: 'Return Of Posted Check / Item Electronic Transaction',
      });
    });

    describe('duplicate merchant name, phrase, prefix, suffix', function() {
      createTest({
        input: 'MURPHY7643ATWA 04/10 #000253237 PURCHASE MURPHY7643ATWALMA',
        output: 'Murphy',
      });
    });
  });
});
