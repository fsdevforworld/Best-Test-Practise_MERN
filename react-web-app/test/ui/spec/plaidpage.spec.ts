import PlaidPage from '../pages/PlaidPage';
import WelcomeBackPage from '../pages/WelcomeBackPage';
import ConnectBankPage from '../pages/ConnectBankPage';
import ApprovalPage from '../pages/ApprovalPage';
import { expect } from 'chai';

describe('Plaid Page', () => {
  beforeEach(() => {
    ConnectBankPage.navigateToConnectBankPage();
    ConnectBankPage.connectBankButton.click();
    // TODO: REMOVE GODDAMN PAUSE SHAME ON YOU
    browser.pause(1000);
  });

  it('should be able to connect bank', () => {
    PlaidPage.connectBank('user_good', 'pass_good');
    WelcomeBackPage.appStoreIcon.waitForExist(25000);
    expect(WelcomeBackPage.appStoreIcon.isDisplayed()).to.eq(true);
  });

  it('should not be able to connect bank if account has already been connected', () => {
    PlaidPage.connectBank('user_good', 'pass_good');
    ApprovalPage.weGotThisAccountCoveredTitle.waitForExist(25000);
    expect(ApprovalPage.weGotThisAccountCoveredTitle.isDisplayed()).to.eq(true);
  });

  it('should show install app modal for long tail bank connection', () => {
    PlaidPage.connectLongTailBank();
    ApprovalPage.downloadOurAppToProceedTitle.waitForExist(25000);
    expect(ApprovalPage.downloadOurAppToProceedTitle.isDisplayed()).to.eq(true);
  });
});
