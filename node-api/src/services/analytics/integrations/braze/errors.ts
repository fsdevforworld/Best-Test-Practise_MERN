import { define } from '@dave-inc/error-types';

export const failingService = 'braze';
export const gatewayService = 'node-api';

export const BrazeError = define('Braze', 502, { failingService, gatewayService });
