import * as Faker from 'faker';
import { sequelize } from '../../src/models';
import { MerchantInfo } from '../../src/models';
import * as Bluebird from 'bluebird';

export default function(factory: any) {
  factory.define(
    'merchant-info',
    MerchantInfo,
    (buildOptions: any) => {
      const attrs = {
        name: '',
        displayName: Faker.lorem.words(),
        url: Faker.internet.url(),
        logo: Faker.image.imageUrl(),
        exclude: 0,
      };
      attrs.name = attrs.displayName.split(/\s+/)[0];
      return attrs;
    },
    {
      afterCreate: async (model: any, attrs: any, buildOptions: any) => {
        const tokenStrings =
          buildOptions.tokenString || MerchantInfo.tokenizeTransactionName(model.displayName);
        const merchantTokenId = model.id;
        const category = buildOptions.category || null;
        const subCategory = buildOptions.subCategory || null;
        try {
          const sql =
            'INSERT INTO bank_transactions_tokens (token_string, merchant_info_id, category, sub_category) VALUES(?, ?, ?, ?)';
          await Bluebird.map(tokenStrings, token =>
            sequelize.query(sql, { replacements: [token, merchantTokenId, category, subCategory] }),
          );
        } catch {
          // ignore errors for unit test mode
        }
        return model;
      },
    },
  );
}
