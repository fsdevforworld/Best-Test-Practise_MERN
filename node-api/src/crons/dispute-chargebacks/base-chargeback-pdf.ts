import * as PDF from 'pdfkit';
import { moment } from '@dave-inc/time-lib';
import { User } from '../../models';
import * as Bluebird from 'bluebird';
import { find } from 'lodash';

export async function createStandardPDF() {
  const doc = new PDF({ size: 'LETTER' });
  doc.fontSize(10);
  doc.lineGap(2);
  await addIntroPage(doc);
  doc.text('\n\n');
  return doc;
}

async function addIntroPage(doc: PDFKit.PDFDocument) {
  doc.text(`
${moment().format('MM/DD/YYYY')}
Dave, Inc.
1265 S Cochran Ave
Los Angeles, CA 90019
For any questions regarding this dispute, please contact us at:
chargebacks@dave.com
+1 (323) 922-5209
We are available to answer the phone from 9am-5pm PST Monday through Friday.`);
}

export async function addUserInfo(doc: PDFKit.PDFDocument, user: User, exceptionId: string) {
  doc.addPage();
  let deletedText: string;
  if (user.isSoftDeleted()) {
    deletedText = `This user cancelled their Dave account with us on ${user.deleted.format(
      'MM/DD/YYYY',
    )} after paying back all advances.`;
  } else {
    deletedText = 'This user has not cancelled their Dave account.';
  }

  doc.text(`
Chargeback ${exceptionId}
Customer Details:
Name: ${user.firstName} ${user.lastName}
Phone Number: ${user.phoneNumber} (confirmed via text with verification code)
Email: ${user.email}
Address:
${user.addressLine1} ${user.addressLine2 || ''}
${user.city}, ${user.state} ${user.zipCode}

${deletedText}

  `);
}

export async function addSubscriptionInfo(doc: PDFKit.PDFDocument, user: User) {
  const billings = await user.getSubscriptionBillings();

  doc.addPage();

  doc.text(
    `This user has been a member since ${user.created.format(
      'MM/DD/YYYY',
    )}. They have been billed for ${billings.length} months of service.`,
  );

  await Bluebird.mapSeries(billings, async billing => {
    const payments = await billing.getSubscriptionPayments();
    const firstPayment = find(payments, payment => payment.isPaid());
    doc.text(
      `${billing.billingCycle}: ${
        firstPayment ? `Paid on ${firstPayment.created.format('MM/DD/YYYY')}` : 'Unpaid'
      }`,
    );
  });
}
