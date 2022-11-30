import * as chai from 'chai';
import * as sinon from 'sinon';
import * as chaiAsPromised from 'chai-as-promised';
const expect = chai.expect;
chai.use(chaiAsPromised);

import { uploadUserProfileImage } from '@api/v2/user/profile-image-uploader';

import * as uuid from 'uuid';
import gcloudStorage from '../../../../src/lib/gcloud-storage';
import logger from '../../../../src/lib/logger';

describe('Profile Image Uploader', () => {
  const sandbox = sinon.createSandbox();
  type MethodStubs = 'uniqueId' | 'saveImage';
  type StubTypes = Record<MethodStubs, sinon.SinonStub>;

  let stubs: StubTypes | undefined;

  const mockImageFilename = 'RANDOMunqiueIMAGEfileNAME';

  beforeEach(() => {
    stubs = {
      uniqueId: sandbox.stub(uuid, 'v4'),
      saveImage: sandbox.stub(gcloudStorage, 'saveImageToGCloud'),
    };
  });

  afterEach((): void => {
    sandbox.restore();
    Object.values(stubs).forEach(stub => {
      stub.restore();
      stub.reset();
    });
  });

  it('should return the newly uploaded images URL', async () => {
    const fullImageUrl = `https://static.dave.com/user-profile-images/${mockImageFilename}`;
    const fakeImageBytes = `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`;

    stubs.saveImage.resolves(fullImageUrl);
    stubs.uniqueId.returns(mockImageFilename);
    const result = await uploadUserProfileImage(fakeImageBytes);

    expect(result).to.equal(fullImageUrl, 'Should return the new file path for the image');
    sinon.assert.calledOnce(stubs.saveImage);
    sinon.assert.calledWith(
      stubs.saveImage,
      fakeImageBytes,
      'user-profile-images',
      mockImageFilename,
    );
  });

  it('should throw an error if the image fails to upload', async () => {
    const expectedErrorMessage = 'Failed to upload image!';

    const gcloudStub = stubs.saveImage.rejects(new Error(expectedErrorMessage));
    const errorLoggerSpy = sandbox.spy(logger, 'error');

    await expect(uploadUserProfileImage('foooooooo_test')).to.be.rejectedWith(expectedErrorMessage);
    sinon.assert.calledOnce(gcloudStub);
    sinon.assert.calledOnce(errorLoggerSpy);
  });
});
