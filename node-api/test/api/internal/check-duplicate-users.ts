import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as request from 'supertest';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import app from '../../../src/api';

import { User } from '../../../src/models';

import { AUTH_SECRET, CLIENT_ID } from './test-constants';

describe('Internal Check Duplicate Uesrs API Endpoint', () => {
  const baseServicePath = '/internal';
  const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString('base64')}`;
  let baseUser: User;

  const firstName = 'Pelly';
  const lastName = 'Pelican';
  const birthdate = moment('1977-05-24');

  before(() => clean());
  afterEach(() => clean());

  beforeEach(async () => {
    await up();
    baseUser = await factory.create<User>('user', { firstName, lastName, birthdate });
  });

  it('should return duplicate users', async () => {
    const duplicateUser = await factory.create<User>('user', { firstName, lastName, birthdate });

    const response = await request(app)
      .get(`${baseServicePath}/duplicate-users/${baseUser.id}`)
      .query({ otherUsers: [duplicateUser.id] })
      .set('Authorization', authHeader);

    expect(response.body).to.deep.equal([
      {
        id: duplicateUser.id,
        identical: true,
        deleted: null,
      },
    ]);
  });

  [{ testName: 'first name', firstName: 'Pally', lastName, birthdate }].forEach(o =>
    it(`Should return non-duplicate users: ${o.testName}`, async () => {
      const nonDuplicateUser = await factory.create<User>('user', {
        firstName: o.firstName,
        lastName: o.lastName,
        birthdate: o.birthdate,
      });
      const response = await request(app)
        .get(`${baseServicePath}/duplicate-users/${baseUser.id}`)
        .query({ otherUsers: [nonDuplicateUser.id] })
        .set('Authorization', authHeader);

      expect(response.body).to.deep.equal([
        {
          id: nonDuplicateUser.id,
          identical: false,
          deleted: null,
        },
      ]);
    }),
  );

  it('should tell when the user was deleted', async () => {
    const duplicateUser = await factory.create<User>('user', { firstName, lastName, birthdate });
    await duplicateUser.destroy();

    const response = await request(app)
      .get(`${baseServicePath}/duplicate-users/${baseUser.id}`)
      .query({ otherUsers: [duplicateUser.id] })
      .set('Authorization', authHeader);

    expect(response.body[0].deleted).not.to.be.null;
  });

  it('handles multiple otherUsers values', async () => {
    const duplicateUser1 = await factory.create<User>('user', { firstName, lastName, birthdate });
    const duplicateUser2 = await factory.create<User>('user', { firstName, lastName, birthdate });
    const nonDuplicateUser = await factory.create<User>('user', {
      firstName: 'Polly',
      lastName: 'Pelican',
      birthdate,
    });

    const response = await request(app)
      .get(`${baseServicePath}/duplicate-users/${baseUser.id}`)
      .query({ otherUsers: [duplicateUser1.id, duplicateUser2.id, nonDuplicateUser.id].join(',') })
      .set('Authorization', authHeader);

    expect(response.body.length).to.equal(3);
    response.body.forEach((o: { id: number; identical: boolean }) => {
      switch (o.id) {
        case duplicateUser1.id:
        case duplicateUser2.id:
          expect(o.identical).to.be.true;
          break;
        case nonDuplicateUser.id:
          expect(o.identical).to.be.false;
          break;
        default:
          expect(false, 'Got an unknown user ID').to.be.true;
      }
    });
  });
});
