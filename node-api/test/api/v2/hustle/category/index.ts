import { HustleCategoryResponse, HustleCategory } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';
import app from '../../../../../src/api';
import * as HustleService from '../../../../../src/domain/hustle';
import { User } from '../../../../../src/models';

describe('GET /v2/hustles/categories', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  const expectedResponse: HustleCategoryResponse[] = [
    { name: HustleCategory.AVIATION, image: 'url', priority: 2 },
    { name: HustleCategory.NON_PROFIT, image: 'url', priority: 7 },
    { name: HustleCategory.SUPPLY_CHAIN, image: 'url', priority: 8 },
  ];

  it('should return HustleCategoryResponse[]', async () => {
    const user = await factory.create<User>('user');
    sandbox.stub(HustleService, 'getCategories').resolves(expectedResponse);

    const response = await request(app)
      .get('/v2/hustles/categories')
      .set('Authorization', `${user.id}`)
      .set('X-Device-Id', `${user.id}`)
      .send();
    expect(response.body).to.deep.equal(expectedResponse);
  });

  it('should return UnauthorizedError if user credentials are invalid', async () => {
    await request(app)
      .get('/v2/hustles/categories')
      .set('Authorization', `123`)
      .set('X-Device-Id', `123`)
      .send()
      .expect(401);
  });
});
