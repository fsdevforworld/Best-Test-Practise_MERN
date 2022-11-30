import { IApiGetCardFunding } from '@dave-inc/banking-internal-api-client';
import { formatCurrency } from '../../lib/utils';

export async function addCardFundingIntro(doc: PDFKit.PDFDocument) {
  doc.text(
    `Dave.com offers an online bank account issued by Evolve Bank & Trust.  A consumer can use another issuer’s debit card to add funds to their Dave.com managed Evolve bank account.`,
  );
}

export async function addCurrentCardFundingInfo(
  doc: PDFKit.PDFDocument,
  cardFunding: IApiGetCardFunding,
) {
  doc.text(
    `The external deposit funding the customer is disputing was requested from us on ${cardFunding.initiatedAt}.\n`,
  );
  const totalAmount = cardFunding.loadAmount + cardFunding.feeAmount;
  doc.text(`The external payment method was debited ${formatCurrency(totalAmount, 2)}.`);
  doc.text(
    `${formatCurrency(cardFunding.loadAmount, 2)} was deposited in their Dave Spending account.`,
  );
  if (cardFunding.feeAmount > 0) {
    doc.text(
      `A fee of ${formatCurrency(
        cardFunding.feeAmount,
        2,
      )} was authorized by the customer and included in the total.`,
    );
  }
  doc.text('\n\n');
  doc.text('Card Funding Details:');
  await addSingleCardFundingDetails(doc, cardFunding);
}

export async function addSingleCardFundingDetails(
  doc: PDFKit.PDFDocument,
  cardFunding: IApiGetCardFunding,
) {
  const totalAmount = cardFunding.loadAmount + cardFunding.feeAmount;
  doc.text(`${cardFunding.initiatedAt}`);
  doc.text(`Total amount: ${formatCurrency(totalAmount, 2)}`);
  doc.text(`Load amount: ${formatCurrency(cardFunding.loadAmount, 2)}`);
  doc.text(`Fees: ${formatCurrency(cardFunding.feeAmount, 2)}`);
  doc.text(`Funding Type: ${cardFunding.type}`);
  if (cardFunding.lastFour) {
    doc.text(`Card Last Four: ${cardFunding.lastFour}`);
  }
  doc.text(`Dave Spending account funded at ${cardFunding.fundedAt}`);
}

export async function addOtherCardFundingInfo(
  doc: PDFKit.PDFDocument,
  cardFundings: IApiGetCardFunding[],
) {
  const nonFailedFundings = cardFundings.filter(funding => funding.failedAt === undefined);
  if (cardFundings.length > 0) {
    doc.addPage();
    doc.text('Card Funding History:');
  }
  for (const fundings of nonFailedFundings) {
    await addSingleCardFundingDetails(doc, fundings);
    doc.text('\n');
  }
}
