import { TrackBody } from '../../types';
import validate from './helpers/validate';

import { post } from './helpers/api';

export async function track(body: TrackBody) {
  const data = validate(body);
  return post(data);
}
