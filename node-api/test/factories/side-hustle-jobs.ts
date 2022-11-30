import { SideHustleJob } from '../../src/models';

export default function(factory: any) {
  factory.define('side-hustle-job', SideHustleJob, {
    name: 'Job Name',
    company: 'Company Name',
    tagline: 'Job tagline',
    active: 1,
    logo: '',
    affiliateLink:
      'http://instacart-shoppers.sjv.io/c/1297951/471903/8281?subId1=USER_ID&sharedid=000_Dave.com',
    externalId: 'company',
    sideHustleProviderId: factory.assoc('side-hustle-provider', 'id'),
  });
}
