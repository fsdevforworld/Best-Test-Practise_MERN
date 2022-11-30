import factory from '../../test/factories';
import './create-fraud-user';

async function up() {
  const addressLine1 = '123 Fraud St';
  const state = 'CA';
  const city = 'Los Angeles';
  const zipCode = '90019';

  await factory.create('fraud-rule', {
    addressLine1,
    state,
    city,
    zipCode,
    isActive: true,
  });
}

export { up };
