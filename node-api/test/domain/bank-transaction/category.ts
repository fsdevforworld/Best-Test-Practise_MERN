import 'mocha';
import { expect } from 'chai';
import { getCategory, getSubCategory } from '../../../src/domain/bank-transaction';
import factory from '../../factories';
import * as sinon from 'sinon';

describe('category', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => sandbox.restore());

  describe('getCategory', () => {
    it('should return category', async () => {
      const txn = await factory.build('bank-transaction', {
        plaidCategory: ['Hello', 'World'],
      });
      expect(getCategory(txn)).to.equal('Hello');
    });

    it('should return empty string if no category', async () => {
      const txn = await factory.build('bank-transaction', {
        plaidCategory: null,
      });
      expect(getCategory(txn)).to.equal('');
    });
  });

  describe('getSubCategory', () => {
    it('should return sub category', async () => {
      const txn = await factory.build('bank-transaction', {
        plaidCategory: ['Hello', 'World'],
      });
      expect(getSubCategory(txn)).to.equal('World');
    });

    it('should return empty string if no sub category', async () => {
      const txn = await factory.build('bank-transaction', {
        plaidCategory: null,
      });
      expect(getCategory(txn)).to.equal('');
    });
  });
});
