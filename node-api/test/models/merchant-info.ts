import { expect } from 'chai';
import { MerchantInfo } from '../../src/models';
import factory from '../factories';
import { clean } from '../test-helpers';
import * as Bluebird from 'bluebird';

describe('Merchant Info Model', () => {
  before(() => clean());
  afterEach(() => clean());

  it('getMerchantInfo with empty displayName', async () => {
    const displayName = 'Dave Inc';
    const category: string = null;
    const subCategory: string = null;
    await factory.create(
      'merchant-info',
      { displayName },
      { tokenString: ['dave com'], category, subCategory },
    );
    const merchantInfo = await MerchantInfo.getMerchantInfo('', category, subCategory);
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
    const merchantInfo = await MerchantInfo.getMerchantInfo(
      'dave.com subscription',
      category,
      subCategory,
    );
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
      const merchantInfo = await MerchantInfo.getMerchantInfo(token, category, subCategory);
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
    const merchantInfo = await MerchantInfo.getMerchantInfo('uber trip ca', category, subCategory);
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
    const merchantInfo = await MerchantInfo.getMerchantInfo('uber trip ca', category, 'Banking');
    expect(merchantInfo.displayName).to.be.equal('');
    expect(merchantInfo.categoryImage).to.match(/^https?:/);
  });

  it('getMerchantInfo with displayName that does not have a mapping', async () => {
    const displayName = 'Nicks Pizza';
    const category = 'Food';
    const subCategory: string = null;
    const merchantInfo = await MerchantInfo.getMerchantInfo(displayName, category, subCategory);
    expect(merchantInfo.displayName).to.be.equal('');
    expect(merchantInfo.categoryImage).to.match(/^https?:/);
  });
});
