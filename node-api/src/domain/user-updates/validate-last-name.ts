import { User } from '../../models';
import { InvalidParametersError } from '../../lib/error';

async function validateLastName(user: User, name: string) {
  const hasBanking = await user.hasDaveBanking();

  if (hasBanking ? !isValidBankingName(name) : !isValidCoreName(name)) {
    throw new InvalidParametersError('Name is not formatted correctly');
  }
}

function isValidBankingName(name: string): boolean {
  const pattern = /^[a-zA-Z\-'\s]{2,30}$/;
  const matches = name.match(pattern);

  return matches?.length === 1;
}

function isValidCoreName(name: string): boolean {
  const pattern = /^[a-zA-Z\-'\s.]{2,}$/;
  const matches = name.match(pattern);

  return matches?.length === 1;
}

export default validateLastName;
