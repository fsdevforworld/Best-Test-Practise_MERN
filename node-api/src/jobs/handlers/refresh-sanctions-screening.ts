import { User, SynapsepayDocument } from '../../models';
import { fetchSynapsePayUser } from '../../domain/synapsepay/user';
import { sendUploadLicense } from '../../domain/notifications';
import { SynapsepayDocumentLicenseStatus } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import { RefreshSanctionsScreeningPayload } from '../data';
import logger from '../../lib/logger';

export async function refreshSanctionsScreening({ userId }: RefreshSanctionsScreeningPayload) {
  dogstatsd.increment('refresh_sanctions_screening.task_started');
  logger.info('running RefreshSanctionsScreening on Faktory');
  const user = await User.findByPk(userId, {
    include: [SynapsepayDocument],
  });

  if (!user) {
    return;
  }

  const {
    json: { documents },
  } = await fetchSynapsePayUser(user);

  const updates = user.synapsepayDocuments.map(synapseDoc => {
    const matchingData = documents.find(({ id }) => id === synapseDoc.synapsepayDocId);
    return synapseDoc.updateSanctionsScreening(matchingData);
  });

  const updatedDocuments = await Promise.all(updates);
  dogstatsd.increment('refresh_sanctions_screening.documents_updated');

  const requiresIdUpload = updatedDocuments.some(document => {
    const licenseUploaded = [
      SynapsepayDocumentLicenseStatus.Reviewing,
      SynapsepayDocumentLicenseStatus.Valid,
    ].includes(document.licenseStatus);
    return document.sanctionsScreeningMatch && !licenseUploaded;
  });

  if (requiresIdUpload) {
    dogstatsd.increment('refresh_sanctions_screening.requires_id_upload');
    await sendUploadLicense(userId);
  }
  dogstatsd.increment('refresh_sanctions_screening.task_completed');
}
