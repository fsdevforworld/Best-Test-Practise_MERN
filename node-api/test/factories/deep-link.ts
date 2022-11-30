import { DeepLink } from '../../src/models';

export default function(factory: any) {
  factory.define('deep-link', DeepLink, {
    min_version: `2.13.4`,
    max_version: `2.13.5`,
  });
}
