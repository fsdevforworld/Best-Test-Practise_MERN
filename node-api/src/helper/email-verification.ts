import * as config from 'config';
import { EmailVerification } from '../models';
import { encode } from '../lib/jwt';
import { checkIfEmailIsDuplicate } from '../helper/user';
import { broadcastEmailUnverified } from '../domain/user-updates';

const DAVE_API_URL = config.get('dave.api.url');

type IAttemptCreateAndSendEmailVerification = {
  id: number;
  newEmail?: string;
  oldEmail?: string;
};

export function generateToken({ id, email }: { id: number; email: string }) {
  return encode({ id, email }, { expire: false });
}

export async function sendEmail(
  userId: number,
  verificationId: number,
  email: string,
  oldEmail: string,
): Promise<void> {
  const token = generateToken({ id: verificationId, email });
  const url = `${DAVE_API_URL}/v2/email_verification/verify/${token}`;
  await broadcastEmailUnverified(userId, email, oldEmail, url);
}

export async function attemptCreateAndSendEmailVerification(
  userInfo: IAttemptCreateAndSendEmailVerification,
): Promise<void> {
  const { id, newEmail, oldEmail } = userInfo;

  if (newEmail && oldEmail !== newEmail) {
    await checkIfEmailIsDuplicate(newEmail, id);
    const verification = await EmailVerification.create({ userId: id, email: newEmail });
    await sendEmail(id, verification.id, newEmail, oldEmail);
  }
}
