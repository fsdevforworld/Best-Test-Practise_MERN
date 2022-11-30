import { expect } from 'chai';
import { getBrazeUserData, replayHttp } from '../test-helpers';

describe('getBrazeUserData', () => {
  it(
    'fetches user data',
    replayHttp('test-helpers/get-braze-user-data-success.json', async () => {
      const externalIds = ['2'];
      const response = await getBrazeUserData(externalIds);
      const userData = response.body.users[0];
      expect(userData.first_name).to.exist;
      expect(userData.last_name).to.exist;
      expect(userData.dob).to.exist;
      expect(userData.phone).to.exist;
      expect(userData.email).to.exist;
      expect(userData.home_city).to.exist;
      expect(userData.country).to.exist;
    }),
  );
});
