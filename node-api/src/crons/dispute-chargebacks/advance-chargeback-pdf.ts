import { Advance, Payment, User } from '../../models';
import { formatCurrency } from '../../lib/utils';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as request from 'superagent';

export async function addAdvancesIntro(doc: PDFKit.PDFDocument) {
  doc.text(`Dave.com is a consumer service allowing our customers to monitor their checking accounts for overdrafts/potential NSFs. A consumer can receive an advance on demand for up to $75.
Prior to receiving the advance, the user agrees to pay back the full amount of the advance, plus the payment processing fees that Dave.com pays, plus an optional tip specified by the user.
The terms that the user agrees to are available at dave.com/payment-authorization and dave.com/terms, with the most relevant section included below.
The customer received their advance to the card listed below and Dave.com collected the advance back from the same card.
`);
}

export async function addCurrentAdvanceInfo(
  doc: PDFKit.PDFDocument,
  user: User,
  advance: Advance,
  payment: Payment,
  lastFour: string,
) {
  const [advancePayments, advanceTip] = await Promise.all([
    advance.getPayments(),
    advance.getAdvanceTip(),
  ]);

  doc.text(`The advance this customer is disputing was requested from us on ${advance.created.format(
    'MM/DD/YYYY',
  )}.
We deposited ${formatCurrency(
    advance.amount,
    2,
  )} to that user's account on ${advance.created.format('MM/DD/YYYY')}.
We collected their total amount due over ${advancePayments.length} payments:
${advancePayments
  .map(advancePayment => {
    return `- ${advancePayment.created.format('MM/DD/YYYY')}: ${formatCurrency(
      advancePayment.amount,
      2,
    )} ${
      [ExternalTransactionStatus.Returned, ExternalTransactionStatus.Canceled].includes(
        advancePayment.status,
      )
        ? '(ACH Transaction - RETURNED)'
        : '(COMPLETED)'
    }`;
  })
  .join('\n')}


  `);
  doc.text('Advance Details:');
  doc.text(`Disbursed On: ${advance.created.format('MM/DD/YYYY')}`);
  doc.text(`Due Date: ${advance.paybackDate.format('MM/DD/YYYY')}`);
  doc.text(`Amount: ${formatCurrency(advance.amount, 2)}`);
  doc.text(`Processing Fees Authorized By Customer : ${formatCurrency(advance.fee, 2)}`);
  doc.text(`Tip Authorized By Customer: ${formatCurrency(advanceTip.amount, 2)}`);
  doc.text(
    `Total due before collection: ${formatCurrency(
      advanceTip.amount + advance.fee + advance.amount,
      2,
    )} (for this advance)`,
  );
  doc.text(
    `Total available for collection on ${payment.created.format('MM/DD/YYYY')}: ${formatCurrency(
      payment.amount,
      2,
    )}`,
  );
  doc.text(`Total Charged To Debit Card: ${formatCurrency(payment.amount, 2)}`);
  doc.text(
    `Balance due after collection: ${formatCurrency(advance.outstanding, 2)} (for this advance)`,
  );
  doc.text('\n\n');

  doc.text('Payment Details:');
  doc.text(`Collected On: ${payment.created.format('MM/DD/YYYY')}`);
  doc.text(`Card Last Four: ${lastFour}`);
}

export async function addOtherAdvancesInfo(doc: PDFKit.PDFDocument, userAdvances: Advance[]) {
  doc.addPage();
  doc.text(`This customer has requested ${userAdvances.length} advances.`);

  for (const userAdvance of userAdvances) {
    const advanceTip = await userAdvance.getAdvanceTip();
    doc.text(`
${formatCurrency(userAdvance.amount)} Advance from ${userAdvance.created.format(
      'MM/DD/YYYY',
    )}      Outstanding: ${userAdvance.outstanding}      Disbursement: COMPLETED
`);
    doc.fontSize(8);
    doc.text(`Disbursed On: ${userAdvance.created.format('MM/DD/YYYY')}`);
    doc.text(`Due Date: ${userAdvance.paybackDate.format('MM/DD/YYYY')}`);
    doc.text(`Amount: ${formatCurrency(userAdvance.amount, 2)}`);
    doc.text(`Processing Fees Authorized By Customer : ${formatCurrency(userAdvance.fee, 2)}`);
    doc.text(`Tip Authorized By Customer: ${formatCurrency(advanceTip.amount, 2)}`);
    doc.text(
      `Total collected or due for collection: ${formatCurrency(
        userAdvance.amount + advanceTip.amount + userAdvance.fee,
        2,
      )}`,
    );
    doc.fontSize(10);
  }
}

export async function addPaymentAuthorization(doc: PDFKit.PDFDocument) {
  doc.addPage();

  doc.text(`
Dave.com Payment Authorization

The user explicitly agreed to our payment authorization, which is copied below.
  "I hereby authorize Dave, Inc (“Dave”), its parent, affiliates, any holder of my advance and their respective agents and their assignees to initiate, depending on the payment method I select on the following page, a single or recurring electronic debit entry/entries to my designated checking or savings account (“Account”) at my designated financial institution (“Financial Institution”) for which I am an authorized user, as well as any Account or Financial Institution I later designate, for payment of the monthly payment(s) on my advance, if my advance originates. I acknowledge that the origination of electronic debits to my Account must be permitted by my Financial Institution, which must be located in the United States. I will not dispute Dave debiting my checking/savings/debit card/credit card accounts, so long as the transaction corresponds to the terms indicated in this online form and my agreement with Dave."
`);
}

export async function addScreenshot(doc: PDFKit.PDFDocument, advance: Advance) {
  doc.addPage();
  doc.text(`This is a screenshot of the screen where the user agreed to allow Dave.com to withdraw the full amount of their advance.
To populate the legal name section, the user typed their full name into a text field.`);
  doc.text('\n');

  if (advance.screenshotImage) {
    const image = (await request.get(advance.screenshotImage)).body;
    doc.image(image, { height: 500 });
  } else {
    doc.image('./example-screenshot.png', { height: 500 });
  }
}
