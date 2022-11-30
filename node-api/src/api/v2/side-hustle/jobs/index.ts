import { IDaveRequest, IDaveResponse } from '../../../../typings/dave-request-response';
import { SideHustleJobResponse } from '@dave-inc/wire-typings';
import { getSideHustles } from './controller';
import { validateDaveSortBy } from './validator';
/**
 * All active side hustle jobs
 */
async function get(req: IDaveRequest, res: IDaveResponse<SideHustleJobResponse[]>) {
  const sortBy = req.query.sortBy;
  if (sortBy) {
    validateDaveSortBy(sortBy);
  }
  const jobs = await getSideHustles(sortBy);
  res.send(jobs);
}

export default {
  get,
};
