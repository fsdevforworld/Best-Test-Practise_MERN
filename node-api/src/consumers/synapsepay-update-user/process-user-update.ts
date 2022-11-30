import { fetchSynapsePayUser, handleSynapsePayDocumentUpdate } from '../../domain/synapsepay';
import { User, SynapsepayDocument } from '../../models';
import { UserWebhookData } from 'synapsepay';
import { dogstatsd } from '../../lib/datadog-statsd';
import log from './log';
import logger from '../../lib/logger';

export async function processSynapsepayUserUpdate(webhookData: UserWebhookData): Promise<void> {
  if (webhookData.extra.cip_tag === 2) {
    return;
  }
  const user = await extractUser(webhookData);
  if (user) {
    const synapsepayJson = (await fetchSynapsePayUser(user)).json;
    await handleSynapsePayDocumentUpdate(user.id, synapsepayJson);
    log(logger.info, 'Synapsepay document fetched', webhookData._id.$oid, {
      userId: user.id,
      document_id: synapsepayJson._id,
    });
  } else {
    log(logger.info, 'User not found', webhookData._id.$oid, { webhookData });
    dogstatsd.increment('overdraft.synapsepay_update_user.user_not_found');
  }
}

export async function extractUser(webhookData: UserWebhookData): Promise<User> {
  const synapsepayId: string = webhookData._id.$oid;
  let user = await User.findOne({ where: { synapsepayId }, paranoid: false });
  if (!user) {
    const doc = await SynapsepayDocument.findOne({
      where: { synapsepayUserId: synapsepayId },
      include: [{ model: User, paranoid: false }],
      paranoid: false,
    });
    if (doc) {
      user = doc.user;
      user.synapsepayId = doc.synapsepayUserId;
    }
  }
  return user;
}
