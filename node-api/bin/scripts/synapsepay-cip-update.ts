import * as Bluebird from 'bluebird';
import * as config from 'config';
import { countBy } from 'lodash';
import { sequelize, SynapsepayDocument } from '../../src/models';
import logger from '../../src/lib/logger';
import { getAgent, getUserHeader } from '../../src/domain/synapsepay';

const { hostUrl: SYNAPSEPAY_HOST_URL } = config.get('synapsepay');

async function updateCipTag(document: SynapsepayDocument) {
  const user = await document.getUser();

  const userHeader = await getUserHeader(user, {
    synapsepayUserId: document.synapsepayUserId,
  });

  const agent = getAgent().set(userHeader);

  const url = `${SYNAPSEPAY_HOST_URL}/v3.1/users/${document.synapsepayUserId}`;

  return agent.patch(url).send({
    extra: {
      cip_tag: 1,
    },
  });
}

async function main(concurrent?: number) {
  logger.info('Starting synapsepay CIP tag update');
  const concurrency = concurrent || 5;

  const documents = await sequelize.query<SynapsepayDocument>(
    `
      SELECT d.extra->'$.cip_tag' as cip_tag, d.*
      FROM synapsepay_document d
      INNER JOIN user u ON
        u.id = d.user_id AND
          u.deleted = '9999-12-31 23:59:59'
      INNER JOIN bank_connection bc ON
          bc.user_id = d.user_id AND
          bc.banking_data_source = 'BANK_OF_DAVE'
      GROUP BY d.id
      HAVING cip_tag = 2;
    `,
    {
      model: SynapsepayDocument,
      mapToModel: true,
    },
  );

  logger.info(`Found ${documents.length} documents`);

  const updateResults = await Bluebird.map(
    documents,
    async document => {
      try {
        await updateCipTag(document);
        return 'success';
      } catch (error) {
        logger.error('CIP tag update failed', {
          error,
          documentId: document.id,
          userId: document.userId,
          synapsepayUserId: document.synapsepayUserId,
        });
        return 'failed';
      }
    },
    { concurrency },
  );

  const summary = countBy(updateResults);

  logger.info('Finished cip tag updates', {
    summary,
  });
}

const args = process.argv.slice(2);

main(parseInt(args[0], 10))
  .then(() => process.exit())
  .catch(error => {
    logger.error(error);
    process.exit(1);
  });
