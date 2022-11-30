import { Config } from '../../src/models';

export async function up() {
  const configs = [
    {
      key: 'PLAID_DOWN',
      value: false,
    },
    {
      key: 'helpCenterAvailability',
      value: { hourOpen: 5, hourClose: 21 },
    },
    {
      key: 'PASSWORD_REQUIREMENTS',
      value: { minLength: 8 },
    },
  ];

  await Promise.all([
    ...configs.map(({ key, value }) =>
      Config.findOrCreate({
        where: {
          key,
        },
        defaults: {
          key,
          value,
        },
      }),
    ),
  ]);
}
