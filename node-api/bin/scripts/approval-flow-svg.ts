import {
  generateAdvanceApprovalEngineDOTFromJSON,
  generateAdvanceApprovalEngineJSON,
} from '../../src/services/advance-approval/advance-approval-engine/graph';
import * as fs from 'fs';
import { Module, render } from 'viz.js/full.render.js';
// tslint:disable-next-line:no-require-imports
import Viz = require('viz.js');
import logger from '../../src/lib/logger';

const json = generateAdvanceApprovalEngineJSON();
const dotFile = generateAdvanceApprovalEngineDOTFromJSON(json);

const viz = new Viz({ Module, render });

viz
  .renderString(dotFile, { format: 'svg' })
  .then(output => {
    fs.writeFile('approval_graph.svg', output, err => {
      if (err) {
        logger.error('Error getting approval graph', { err });
        process.exit(1);
      }
      logger.info('The file was saved!');
      process.exit(0);
    });
  })
  .catch(err => {
    logger.error('Error getting approval graph', { err });
    process.exit(1);
  });
