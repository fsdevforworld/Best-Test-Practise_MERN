import { expect } from 'chai';
import { replayHttp } from '../../test-helpers';
import * as identityApi from '../../../src/domain/identity-api';

describe('Identity API', () => {
  it(
    'return false if socure kyc has run',
    replayHttp('identity-api/get-user-kyc-failed.json', async () => {
      const result = await identityApi.hasNeverRunSocureKyc(1);
      expect(result).to.eq(false);
    }),
  );

  it(
    'return true if socure kyc has never run',
    replayHttp('identity-api/get-user-kyc-never-run.json', async () => {
      const result = await identityApi.hasNeverRunSocureKyc(2);
      expect(result).to.eq(true);
    }),
  );
});
