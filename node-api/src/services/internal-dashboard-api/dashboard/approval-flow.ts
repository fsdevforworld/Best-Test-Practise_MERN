import { IDashboardApiRequest, IDaveResponse } from '../../../typings';
import {
  AdvanceApprovalEngineJSON,
  generateAdvanceApprovalEngineDOTFromJSON,
  generateAdvanceApprovalEngineJSON,
} from '../../../../src/services/advance-approval/advance-approval-engine/graph';

import { InvalidParametersError } from '../../../lib/error';

// tslint:disable-next-line:no-require-imports
import Viz = require('viz.js');
import { Module, render } from 'viz.js/full.render.js';

/**
 * Generates a graph representation of the advance approval engine
 *
 * @param req The request
 * @param res The response
 */
async function generateAdvanceApprovalGraph(
  req: IDashboardApiRequest,
  res: IDaveResponse<string | AdvanceApprovalEngineJSON>,
) {
  enum GraphFormat {
    DotRaw = 'dot-raw',
    DotSVG = 'dot-svg',
    JSON = 'json',
  }

  const format = req.query.format || GraphFormat.DotSVG;

  const json = generateAdvanceApprovalEngineJSON();

  switch (format) {
    case GraphFormat.JSON:
      return res.send(json);
    case GraphFormat.DotRaw:
      return res.send(generateAdvanceApprovalEngineDOTFromJSON(json));
    case GraphFormat.DotSVG:
      const viz = new Viz({ Module, render });
      return res.send(await viz.renderString(generateAdvanceApprovalEngineDOTFromJSON(json)));
    default:
      throw new InvalidParametersError(
        `Invalid format provided. Options are: ${Object.values(GraphFormat)}`,
      );
  }
}

export default {
  generateAdvanceApprovalGraph,
};
