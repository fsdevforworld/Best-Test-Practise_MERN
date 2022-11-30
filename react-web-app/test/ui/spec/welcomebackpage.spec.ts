import WelcomeBackPage from '../pages/WelcomeBackPage';
import { expect } from 'chai';

describe('Welcome Back Page', () => {
  beforeEach(() => {
    WelcomeBackPage.open();
  });

  it('should show app store icon', () => {
    WelcomeBackPage.appStoreIcon.waitForExist();
    expect(WelcomeBackPage.appStoreIcon.isDisplayed()).to.eq(true);
  });

  it('should show play store icon', () => {
    expect(WelcomeBackPage.playStoreIcon.isDisplayed()).to.eq(true);
  });

  it('should have copy visible and text should be correct', () => {
    expect(WelcomeBackPage.copy.getText()).to.eq(WelcomeBackPage.existingUserText);
  });
});
