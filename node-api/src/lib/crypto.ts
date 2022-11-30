import * as crypto from 'crypto';

/** Given a payload, a signature, a private key, and an algorithm - determines whether or not the signature
 * is valid for the payload
 */
export function verifyPayload(
  payload: Buffer | string,
  signature: string,
  key: string,
  algo: string,
) {
  const expectedPayloadSignature = crypto
    .createHmac(algo, key)
    .update(payload)
    .digest('hex');

  return signature === expectedPayloadSignature;
}
