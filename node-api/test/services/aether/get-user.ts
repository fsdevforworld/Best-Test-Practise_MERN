import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import factory from '../../factories';

import { User } from '../../../src/models';

import app, { BASE_SERVICE_PATH } from '../../../src/services/aether';

describe('Aether Get Advance API Endpoint', () => {
  before(() => clean());

  it("should return false if the user's fraud status is undefined", async () => {
    const user = await factory.create<User>('user');

    const response = await request(app).get(`${BASE_SERVICE_PATH}/user/${user.id}`);

    expect(response.status).to.equal(200);
    expect(response.body.user.fraud).to.equal(!!user.fraud);
  });

  it("should return true if the user's fraud status is true", async () => {
    const user = await factory.create<User>('user', { fraud: true });

    const response = await request(app).get(`${BASE_SERVICE_PATH}/user/${user.id}`);

    expect(response.status).to.equal(200);
    expect(response.body.user.fraud).to.equal(user.fraud);
  });

  it('should return 404 if a user does not exist', async () => {
    const response = await request(app).get(`${BASE_SERVICE_PATH}/user/66`);

    expect(response.status).to.equal(404);
  });
});
