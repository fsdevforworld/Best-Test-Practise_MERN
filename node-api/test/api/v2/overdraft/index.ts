import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as uuid from 'uuid';
import factory from '../../../factories';
import { clean, mockGCloudStorageUrl } from '../../../test-helpers';
import app from '../../../../src/api';
import gcloudStorage from '../../../../src/lib/gcloud-storage';
import { User } from '../../../../src/models';
import { multerFieldName } from '../../../../src/middleware/image-upload';

const overdraftUploadEndpoint = '/v2/overdraft/upload_screenshot';

describe(`POST ${overdraftUploadEndpoint}`, () => {
  const sandbox = sinon.createSandbox();

  const directory = 'overdraft-screenshots';
  const screenshot = path.join(__dirname, '../../../../example-screenshot.png');
  const stubbedUuid = '6f3019a2-90e8-4454-822c-8f09e8f38dcb';
  let userId: number;

  before(async () => {
    const user = await factory.create<User>('user');
    userId = user.id;
  });

  beforeEach(() => {
    sandbox.stub(uuid, 'v4').returns(stubbedUuid);
  });

  afterEach(() => sandbox.restore());

  after(() => clean(sandbox));

  function generateURL(userIdParam: number) {
    return mockGCloudStorageUrl(directory, userIdParam, stubbedUuid);
  }

  it('requires authentication', async () => {
    await request(app)
      .post(`${overdraftUploadEndpoint}`)
      .set('Authorization', `abc`)
      .set('X-Device-Id', `123`)
      .attach(multerFieldName, screenshot)
      .expect(401);
  });

  it('should return an exception when no image content is provided', async () => {
    const url = generateURL(userId);
    sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);
    const response = await request(app)
      .post(`${overdraftUploadEndpoint}`)
      .set('Authorization', `${userId}`)
      .set('X-Device-Id', `${userId}`)
      .send({ invalidParam: screenshot })
      .expect(400);
    expect(response.body.type).to.equal('invalid_parameters');
  });

  it('should return an screenshotResponse when the screenshot contents are provided', async () => {
    const url = generateURL(userId);
    const gCloudStub = sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);
    const response = await request(app)
      .post(`${overdraftUploadEndpoint}`)
      .set('Authorization', `${userId}`)
      .set('X-Device-Id', `${userId}`)
      .attach(multerFieldName, screenshot)
      .expect(200);
    expect(response.body.screenshotUrl).to.equal(url);
    expect(gCloudStub).to.be.calledWithExactly(
      sinon.match.object,
      directory,
      `${userId}-${stubbedUuid}`,
    );
  });

  it('should return a 502 when the screenshot contents could not be uploaded', async () => {
    const gCloudStub = sandbox.stub(gcloudStorage, 'saveImageToGCloud').returns(null);
    await request(app)
      .post(`${overdraftUploadEndpoint}`)
      .set('Authorization', `${userId}`)
      .set('X-Device-Id', `${userId}`)
      .attach(multerFieldName, screenshot)
      .expect(502);
    expect(gCloudStub).to.be.calledWithExactly(
      sinon.match.object,
      directory,
      `${userId}-${stubbedUuid}`,
    );
  });
});
