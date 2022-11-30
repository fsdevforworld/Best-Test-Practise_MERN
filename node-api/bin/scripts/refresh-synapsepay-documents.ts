import * as Bluebird from 'bluebird';
import { countBy } from 'lodash';
import { Op } from 'sequelize';
import logger from '../../src/lib/logger';
import { SynapsepayDocument } from '../../src/models';
import { refreshDocument } from '../../src/domain/synapsepay';

async function main(lastIdStart?: number, concurrent?: number) {
  logger.info('Starting synapsepay documents refresh');
  const limit = 1000;
  const concurrency = concurrent || 3;

  let lastId = lastIdStart || 0;

  let documents: SynapsepayDocument[] = [];

  do {
    documents = await SynapsepayDocument.findAll({
      where: {
        id: {
          [Op.gt]: lastId,
        },
        permission: {
          [Op.notIn]: ['CLOSED', 'MAKE-IT-GO-AWAY'],
        },
        idScore: null,
      },
      order: [['id', 'ASC']],
      limit,
    });

    const results = await Bluebird.map(
      documents,
      async document => {
        let result = 'pending';
        try {
          await refreshDocument(document);
          result = 'success';
        } catch (error) {
          result = 'failed';
          logger.error('Synapsepay document refresh failed', { error, document });
        }

        return result;
      },
      { concurrency },
    );

    const summary = countBy(results);
    const [lastDoc] = documents.slice(-1);
    if (lastDoc) {
      lastId = lastDoc.id;

      logger.info('Synapsepay document refresh results', {
        lastId,
        summary,
      });
    }
  } while (documents.length > 0);

  logger.info('Finished synapsepay documents refresh');
}

const args = process.argv.slice(2);

main(parseInt(args[0], 10), parseInt(args[1], 10))
  .then(() => process.exit())
  .catch(error => {
    logger.error(error);
    process.exit(1);
  });
