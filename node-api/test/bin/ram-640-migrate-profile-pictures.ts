import 'mocha';
import { expect } from 'chai';
import { User } from '../../src/models';
import * as sinon from 'sinon';
import { clean } from '../test-helpers';
import * as MigrationScript from '../../bin/scripts/ram-640-migrate-profile-pictures';
import { UsersProfileImage } from '../../bin/scripts/ram-640-migrate-profile-pictures';
import * as GoogleCloudStorage from '../../src/lib/gcloud-storage';
import * as Storage from '@google-cloud/storage';

describe('User profile pictures migration script', () => {
  const sandbox = sinon.createSandbox();
  const BACKUP_ENV: NodeJS.ProcessEnv = process.env;

  beforeEach(async () => {
    await clean(sandbox);
  });

  afterEach(async () => {
    process.env = BACKUP_ENV;
    await clean(sandbox);
  });

  describe('makePath should', () => {
    it('include the directory when present in the GCSFilePath', async () => {
      expect(MigrationScript.makePath({ filename: 'hi', directory: 'ok', bucket: 'bye' })).to.be.eq(
        'ok/hi',
      );
    });

    it('include the directory when present in the GCSFilePath', async () => {
      expect(MigrationScript.makePath({ filename: 'hi', bucket: 'bye' })).to.be.eq('hi');
    });
  });

  describe('generateParentDirectory should', () => {
    it('should return only then new dir when passed in empty string, or null', () => {
      expect(MigrationScript.generateParentDirectory(null, 'new')).to.be.eq('new');
      expect(MigrationScript.generateParentDirectory('', 'new')).to.be.eq('new');
    });

    it('should return the new parent when passed in a path', () => {
      expect(MigrationScript.generateParentDirectory('/', 'new')).to.be.eq('new');
      expect(MigrationScript.generateParentDirectory('/////', 'new')).to.be.eq('new');
      expect(MigrationScript.generateParentDirectory('//this/path/old', 'new')).to.be.eq(
        'this/path/new',
      );
      expect(MigrationScript.generateParentDirectory('/this/path/old', 'new')).to.be.eq(
        'this/path/new',
      );
      expect(MigrationScript.generateParentDirectory('this/path/old', 'new')).to.be.eq(
        'this/path/new',
      );
    });
  });

  describe('updateUserProfileImage should', async () => {
    it('return null on a DRY_RUN=true or anything other than false', async () => {
      process.env.DRY_RUN = 'true';
      const stub = sandbox.spy(UsersProfileImage, 'updateSQL');
      expect(await UsersProfileImage.updateUserProfileImage(999999, 'imageURL')).to.be.null;
      expect(stub).to.have.been.callCount(0);
    });

    it('return null on a DRY_RUN=false but the userId is invalid or deleted', async () => {
      process.env.DRY_RUN = 'false';
      sandbox.stub(UsersProfileImage, 'updateSQL').resolves(null);
      expect(await UsersProfileImage.updateUserProfileImage(999998, 'imageURL')).to.be.null;
    });

    it('return User on a DRY_RUN=false and the userId is valid', async () => {
      process.env.DRY_RUN = 'false';
      sandbox.stub(UsersProfileImage, 'updateSQL').resolves({ id: 999998 } as User);
      const result = await UsersProfileImage.updateUserProfileImage(999998, 'imageURL');
      expect(result.id).to.eq(999998);
    });
  });

  describe('copyUserProfileImage should', async () => {
    it('return the DST url on DRY_RUN=true', async () => {
      process.env.DRY_RUN = 'true';
      const stub = sandbox.stub(GoogleCloudStorage, 'copyFile');
      const result = await UsersProfileImage.copyUserProfileImage(
        { bucket: 'hi', filename: 'hi' },
        { bucket: 'bye', filename: 'hi.jpg' },
      );
      expect(result).to.be.eq('https://storage.googleapis.com/bye/hi.jpg');
      expect(stub).to.have.been.callCount(0);
    });

    it('return a non-null self link on DRY_RUN=false', async () => {
      process.env.DRY_RUN = 'false';
      const fileStub = sandbox.createStubInstance(Storage.File);
      const stub = sandbox.stub(GoogleCloudStorage, 'copyFile').resolves(fileStub);
      fileStub.getMetadata.resolves([
        { selfLink: 'https://storage.googleapis.com/cool/man/thanks.jpg' } as Storage.FileMetadata,
      ]);
      fileStub.makePublic.resolves();
      const result = await UsersProfileImage.copyUserProfileImage(
        { bucket: 'hi', filename: 'hi' },
        { bucket: 'bye', filename: 'hi.jpg' },
      );
      expect(result).to.be.eq('https://storage.googleapis.com/cool/man/thanks.jpg');
      expect(stub).to.have.been.callCount(1);
    });

    it('return null when the self link is null on DRY_RUN=false', async () => {
      process.env.DRY_RUN = 'false';
      const fileStub = sandbox.createStubInstance(Storage.File);
      const stub = sandbox.stub(GoogleCloudStorage, 'copyFile').resolves(fileStub);
      fileStub.getMetadata.resolves([{} as Storage.FileMetadata]);
      fileStub.makePublic.resolves();
      const result = await UsersProfileImage.copyUserProfileImage(
        { bucket: 'hi', filename: 'hi' },
        { bucket: 'bye', filename: 'hi.jpg' },
      );
      expect(result).to.be.null;
      expect(stub).to.have.been.callCount(1);
    });
  });

  describe('generateFilename should', async () => {
    it('return a filename with an extension if the extension is present', async () => {
      const result = await MigrationScript.generateFilename('hi.jpg');
      expect(result).to.match(/^.+\.jpg$/i);
    });

    it('return a filename without an extension when it is not present', async () => {
      const result = await MigrationScript.generateFilename('hi');
      expect(result).to.match(/^[^.]+$/i);
    });
  });

  describe('migrateProfileImage should', async () => {
    it('should return null if the user profile picture is null', async () => {
      expect(await UsersProfileImage.migrateProfileImage({ profileImage: null } as Partial<User>))
        .to.be.null;
    });

    it('should return null if the user profile picture is an invalid link', async () => {
      expect(
        await UsersProfileImage.migrateProfileImage({
          profileImage: 'https://gme.com/wsb/amc.jpg',
        } as Partial<User>),
      ).to.be.null;
    });

    it('should return null if the gcs fails to return a new self link', async () => {
      const stub = sandbox.stub(UsersProfileImage, 'copyUserProfileImage').resolves(null);
      expect(
        await UsersProfileImage.migrateProfileImage({
          profileImage: 'https://storage.googleapis.com/bucket/folder/file.jpg',
        } as Partial<User>),
      ).to.be.null;
      expect(stub).to.be.callCount(1);
    });

    it('should return null if the sql update returns null', async () => {
      const gcsStub = sandbox
        .stub(UsersProfileImage, 'copyUserProfileImage')
        .resolves('https://storage.googleapis.com/bucket/folder/new.jpg');
      const userStub = sandbox.stub(UsersProfileImage, 'updateUserProfileImage').resolves(null);
      expect(
        await UsersProfileImage.migrateProfileImage({
          profileImage: 'https://storage.googleapis.com/bucket/folder/file.jpg',
        } as Partial<User>),
      ).to.be.null;
      expect(gcsStub).to.be.callCount(1);
      expect(userStub).to.be.callCount(1);
    });
  });

  describe('getGCSInfoFromSelfLink should', () => {
    it('return null if the link is invalid', () => {
      expect(MigrationScript.getGCSInfoFromSelfLink('https://legoog.com/test/bucket/lol/jpg.jpg'))
        .to.be.null;
      expect(MigrationScript.getGCSInfoFromSelfLink('https://storage.googleapis.com/')).to.be.null;
      expect(MigrationScript.getGCSInfoFromSelfLink('https://storage.googleapis.com///////')).to.be
        .null;
      expect(MigrationScript.getGCSInfoFromSelfLink('https://storage.googleapis.com////f/f//')).to
        .be.null;
      expect(
        MigrationScript.getGCSInfoFromSelfLink(
          'https://storage.googleapis.com/bucket/folder/folder/folder/',
        ),
      ).to.be.null;
      expect(MigrationScript.getGCSInfoFromSelfLink('/test/bucket/lol/jpg')).to.be.null;
      expect(MigrationScript.getGCSInfoFromSelfLink('wat/tf/')).to.be.null;
      expect(MigrationScript.getGCSInfoFromSelfLink(null)).to.be.null;
    });

    it('return a GCS link if the link is valid', () => {
      expect(
        MigrationScript.getGCSInfoFromSelfLink(
          'https://storage.googleapis.com/bucket/1/2/3/file.jpg',
        ),
      ).to.contain({ bucket: 'bucket', directory: '1/2/3', filename: 'file.jpg' });
      expect(
        MigrationScript.getGCSInfoFromSelfLink(
          'https://storage.googleapis.com/bucket/folder/file.jpg',
        ),
      ).to.contain({ bucket: 'bucket', directory: 'folder', filename: 'file.jpg' });
      expect(
        MigrationScript.getGCSInfoFromSelfLink('https://storage.googleapis.com/bucket/file.jpg'),
      ).to.contain({ bucket: 'bucket', filename: 'file.jpg' });
    });
  });

  describe('processBatch should', async () => {
    it('return the entire input set if all users are migrated successfully', async () => {
      process.env.DRY_RUN = 'false';
      process.env.BATCH_RUN = 'false';
      const stub = sandbox.stub(UsersProfileImage, 'migrateProfileImage');
      stub.onCall(0).resolves({ id: 1 });
      stub.onCall(1).resolves({ id: 2 });
      stub.onCall(2).resolves({ id: 3 });
      stub.onCall(3).resolves({ id: 4 });
      await expect(
        MigrationScript.processBatch([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 0),
      ).to.eventually.be.eql([1, 2, 3, 4]);
      expect(stub).to.be.callCount(4);
    });

    it('return the input set if only some users are migrated successfully', async () => {
      process.env.DRY_RUN = 'false';
      process.env.BATCH_RUN = 'false';
      const stub = sandbox.stub(UsersProfileImage, 'migrateProfileImage');
      stub.onCall(0).resolves({ id: 1 });
      stub.onCall(1).resolves(null);
      stub.onCall(2).resolves({ id: 3 });
      stub.onCall(3).resolves(null);
      await expect(
        MigrationScript.processBatch([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 0),
      ).to.eventually.be.eql([1, 3]);
      expect(stub).to.be.callCount(4);
    });
  });
});
