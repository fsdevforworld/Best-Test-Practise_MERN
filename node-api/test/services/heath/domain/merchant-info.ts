import * as Bluebird from 'bluebird';
import factory from '../../../factories';
import { BankTransaction } from '../../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import {
  getMerchantInfo,
  getMerchantInfoForBankTransaction,
} from '../../../../src/services/heath/domain';
import { clean } from '../../../test-helpers';

describe('Banking Data Domain Merchant Info', () => {
  before(() => clean());
  describe('getMerchantInfoForBankTransaction', () => {
    const displayName = 'Dave Inc';
    const tokens: { [t: string]: string[][] } = {
      'dave com': [
        ['Service', null],
        ['Transfer', 'Debit'],
      ],
      'co dave inc': [
        ['Transfer', 'Debit'],
        ['Transfer', 'Withdrawal'],
        ['Transfer', 'Credit'],
      ],
      'dave inc': [
        ['Transfer', 'Credit'],
        ['Transfer', 'Debit'],
        ['Service', 'Financial'],
        ['Food and Drink', 'Restaurants'],
      ],
      'dave inc co': [
        ['Transfer', 'Debit'],
        ['Transfer', 'Credit'],
      ],
    };

    const names: { [t: string]: string[] } = {
      'Direct Debit: Dave, Inc, Debit': ['Transfer', 'Credit'],
      'Dave, Inc DEBIT WEB ID:': ['Transfer', 'Debit'],
      'Dave, Inc DEBIT ID :': ['Service', 'Financial'],
      'ACH WEB-SINGLE DAVE, INC DEBIT': ['Food and Drink', 'Restaurants'],
      'DAVE, INC DEBIT': ['Transfer', 'Debit'],
      'DAVE.COM': ['Service', null],
      'DAVE.COM Subscription': ['Transfer', 'Debit'],
      'Co Dave, Inc DEBIT ID:': ['Transfer', 'Debit'],
      'Dave, Inc Co': ['Transfer', 'Debit'],
    };

    before(async () =>
      Bluebird.map(Object.keys(tokens), async token => {
        await Bluebird.map(tokens[token], async ([category, subCategory]) => {
          await factory.create(
            'merchant-info',
            { displayName },
            { tokenString: [token], category, subCategory },
          );
        });
      }),
    );

    Object.keys(names).map(async name => {
      it(`bank transactions positive amount ${name}`, async () => {
        const amount = 75;
        const [category, subCategory] = names[name];
        const transaction = BankTransaction.build({
          displayName: name,
          amount,
          transactionDate: moment(),
          plaidCategory: [category, subCategory],
        });
        const merchantInfo = await getMerchantInfoForBankTransaction(transaction);
        expect(merchantInfo.displayName).to.be.equal('Dave Inc');
        expect(merchantInfo.logo).to.match(/^https?:/);
        expect(merchantInfo.categoryImage).to.match(/^https?:/);
      });

      it(`bank transactions negative amount ${name}`, async () => {
        const amount = -1.02 * 75;
        const [category, subCategory] = names[name];
        const transaction = BankTransaction.build({
          displayName: name,
          amount,
          transactionDate: moment(),
          plaidCategory: [category, subCategory],
        });
        const merchantInfo = await getMerchantInfoForBankTransaction(transaction);
        expect(merchantInfo.displayName).to.be.equal('Dave Inc');
        expect(merchantInfo.logo).to.match(/^https?:/);
        expect(merchantInfo.categoryImage).to.match(/^https?:/);
      });

      // Not passing category so we won't get merchant info back
      it(`bank transactions with no category ${name}`, async () => {
        const amount = 75;
        const transaction = BankTransaction.build({
          displayName: name,
          amount,
          transactionDate: moment(),
        });
        const merchantInfo = await getMerchantInfoForBankTransaction(transaction);
        expect(merchantInfo.displayName).to.be.equal('');
        expect(merchantInfo.logo).to.be.equal('');
        expect(merchantInfo.categoryImage).to.match(/^https?:/);
      });
    });
  });

  describe('getMerchantInfo', () => {
    it('getMerchantInfo with empty displayName', async () => {
      const displayName = 'Dave Inc';
      const category: string = null;
      const subCategory: string = null;
      await factory.create(
        'merchant-info',
        { displayName },
        { tokenString: ['dave com'], category, subCategory },
      );
      const merchantInfo = await getMerchantInfo('', category, subCategory);
      expect(merchantInfo.displayName).to.be.equal('');
      expect(merchantInfo.categoryImage).to.match(/^https?:/);
    });

    it('getMerchantInfo with displayName that has a mapping but no category or sub category', async () => {
      const displayName = 'Dave Inc';
      const category: string = null;
      const subCategory: string = null;
      await factory.create(
        'merchant-info',
        { displayName },
        { tokenString: ['dave com'], category, subCategory },
      );
      const merchantInfo = await getMerchantInfo('dave.com subscription', category, subCategory);
      expect(merchantInfo.displayName).to.be.equal(displayName);
      expect(merchantInfo.logo).to.match(/^https?:/);
      expect(merchantInfo.categoryImage).to.match(/^https?:/);
    });

    /*
     * McDonald's, Wendy's, Chick-fil-A, Church's Chicken
     * */
    it('getMerchantInfo with displayName that has a mapping but needs apostrophe/dash cleanup', async () => {
      const category = 'Food and Drink';
      const subCategory = 'Restaurants';
      const displayNames = [
        { displayName: "McDonald's", token: 'mcdonald' },
        { displayName: "Wendy's", token: 'wendy' },
        { displayName: 'Chick-fil-A', token: 'chick fil' },
        { displayName: "Church's Chicken", token: 'churchs chicken' },
        { displayName: "Church's Chicken", token: 'church chicken' },
      ];
      await Bluebird.map(displayNames, async ({ displayName, token }) => {
        await factory.create('merchant-info', { displayName }, { category, subCategory });
        const merchantInfo = await getMerchantInfo(token, category, subCategory);
        expect(merchantInfo.displayName).to.be.equal(displayName);
        expect(merchantInfo.logo).to.match(/^https?:/);
        expect(merchantInfo.categoryImage).to.match(/^https?:/);
      });
    });

    it('getMerchantInfo with displayName that has a mapping', async () => {
      const displayName = 'Uber';
      const category = 'Travel';
      const subCategory = 'Car Service';
      await factory.create(
        'merchant-info',
        { displayName },
        { tokenString: ['uber trip ca'], category, subCategory },
      );
      const merchantInfo = await getMerchantInfo('uber trip ca', category, subCategory);
      expect(merchantInfo.displayName).to.be.equal(displayName);
      expect(merchantInfo.logo).to.match(/^https?:/);
      expect(merchantInfo.categoryImage).to.match(/^https?:/);
    });

    it('getMerchantInfo with displayName that has a mapping but different category', async () => {
      const displayName = 'Uber';
      const category = 'Travel';
      const subCategory = 'Car Service';
      await factory.create(
        'merchant-info',
        { displayName },
        { tokenString: ['uber trip ca'], category, subCategory },
      );
      const merchantInfo = await getMerchantInfo('uber trip ca', category, 'Banking');
      expect(merchantInfo.displayName).to.be.equal('');
      expect(merchantInfo.categoryImage).to.match(/^https?:/);
    });

    it('getMerchantInfo with displayName that does not have a mapping', async () => {
      const displayName = 'Nicks Pizza';
      const category = 'Food';
      const subCategory: string = null;
      const merchantInfo = await getMerchantInfo(displayName, category, subCategory);
      expect(merchantInfo.displayName).to.be.equal('');
      expect(merchantInfo.categoryImage).to.match(/^https?:/);
    });
  });
});
