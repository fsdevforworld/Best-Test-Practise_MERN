import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import factory from '../../test/factories';
import { DonationOrganization } from '../../src/models';

async function up() {
  const donationOrgs = await DonationOrganization.findAll();

  if (donationOrgs.length === 0) {
    await Promise.all([
      factory.create('donation-organization', {
        name: DonationOrganizationCode.UNKNOWN,
        code: DonationOrganizationCode.UNKNOWN,
      }),
      factory.create('donation-organization', {
        name: 'Trees for the Future',
        code: DonationOrganizationCode.TREES,
      }),
      factory.create('donation-organization', {
        name: 'Feeding America',
        code: DonationOrganizationCode.FEEDING_AMERICA,
      }),
    ]);
  }
}

export { up };
