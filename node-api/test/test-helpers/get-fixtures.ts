import { isFunction } from 'lodash';
import fixtures from '../fixtures';

export default function getFixtures(providedFixtures?: any[] | any | MochaDone): any[] {
  if (!providedFixtures || isFunction(providedFixtures)) {
    return Object.values(fixtures);
  } else if (Array.isArray(providedFixtures)) {
    return providedFixtures;
  }

  return Object.values(providedFixtures);
}
