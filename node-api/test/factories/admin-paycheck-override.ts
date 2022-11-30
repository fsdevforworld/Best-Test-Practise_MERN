import { IStaticExtended } from 'factory-girl';

import { AdminPaycheckOverride } from '../../src/models';

export default function(factory: IStaticExtended) {
  factory.define('admin-paycheck-override', AdminPaycheckOverride, {});
}
