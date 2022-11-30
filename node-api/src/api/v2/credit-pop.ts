import { isEmpty } from 'lodash';
import CreditPopUser from '../../domain/credit-pop';
import { ForbiddenError } from '../../lib/error';
import { IDaveRequest, IDaveResponse } from '../../typings';

export const CREDIT_POP_BASE_URL = 'https://af.renttrack.com/5KCWZ2/R74QP/?sub2=';
export const USER_ID_URL_PARAM = `&sub3=`;

export async function create(req: IDaveRequest, res: IDaveResponse<string>) {
  const { user } = req;

  const existingCodes = await user.getCreditPopCodes();

  let url;

  if (!isEmpty(existingCodes)) {
    url = `${CREDIT_POP_BASE_URL}${existingCodes[0].code}${USER_ID_URL_PARAM}${user.id}`;
    return res.json(url);
  }

  const creditPopUser = new CreditPopUser(user);

  const isEligible = await creditPopUser.isEligible();
  if (!isEligible) {
    throw new ForbiddenError('Not eligible for Credit Pop');
  }

  const { code } = await creditPopUser.assign();
  url = `${CREDIT_POP_BASE_URL}${code}${USER_ID_URL_PARAM}${user.id}`;

  return res.json(url);
}
