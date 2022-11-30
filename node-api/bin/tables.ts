/**
 * Gets information about tables, outputs in graphviz format
 * @param skipisolatednodes skips rendering tables that are not connected
 * @param skipuserleafnodes skips leaf nodes of the user table
 * @example rm tmp.png; node -r ts-node/register bin/tables.ts skipuserleafnodes skipisolatednodes | dot -Tpng -otmp.png; open tmp.png;
 */

import models from '../src/models';
import { Model } from 'sequelize/types';
import logger from '../src/lib/logger';

async function sampleTask() {
  type tables = { in: string[]; out: string[] };
  const tables: { [tableName: string]: tables } = {};
  function safeGet(tableName: string): tables {
    if (!tables.hasOwnProperty(tableName)) {
      tables[tableName] = { in: [], out: [] };
    }
    return tables[tableName];
  }

  for (const model of Object.values(models as { [key: string]: typeof Model })) {
    const myTable = safeGet(model.tableName);

    for (const association of Object.values(model.associations)) {
      if (association.source === model && association.isSingleAssociation) {
        myTable.out.push(association.target.tableName);
        safeGet(association.target.tableName).in.push(model.tableName);
      }
    }
  }

  logger.info('digraph database {');
  logger.info('rankdir=RL');
  for (const tableName in tables) {
    if (tables.hasOwnProperty(tableName)) {
      const table = tables[tableName];

      // This hides tables that don't have any references in or out
      if (
        process.argv.includes('skipisolatednodes') &&
        table.in.length === 0 &&
        table.out.length === 0
      ) {
        continue;
      }

      // This hides tables that only have one reference, which is to user
      if (
        process.argv.includes('skipuserleafnodes') &&
        table.out.length === 1 &&
        table.out[0] === 'user' &&
        table.in.length === 0
      ) {
        continue;
      }

      logger.info(`${tableName} []`);
      for (const out of table.out) {
        logger.info(`${tableName} -> ${out} []`);
      }
    }
  }
  logger.info('}');
}

sampleTask().catch(error => logger.info(`Error: ${error}`));
