import ConnectBankPage from '../pages/ConnectBankPage';
import { expect } from 'chai';

describe('Connect Your Bank Page', () => {
  beforeEach(() => {
    ConnectBankPage.open();
  });

  it('should display all ui elements', () => {
    expect(ConnectBankPage.connectBankButton.isDisplayed()).to.eq(true);
    expect(ConnectBankPage.whyDoYouNeedMyBankLink.isDisplayed()).to.eq(true);
  });

  it('should open why do you need my bank modal', () => {
    expect(ConnectBankPage.whyDoYouNeedMyBankLink.isDisplayed()).to.eq(true);
    ConnectBankPage.whyDoYouNeedMyBankLink.click();
    ConnectBankPage.whyDoYouNeedMyBankModalVisible.waitForDisplayed(1500);
    expect(ConnectBankPage.whyDoYouNeedMyBankModalVisible.isDisplayed()).to.eq(true);
    ConnectBankPage.arrowRightIcon.click();
    ConnectBankPage.arrowRightIcon.click();
    ConnectBankPage.arrowRightIcon.click();
    ConnectBankPage.closeModalIcon.click();
    expect(ConnectBankPage.connectBankButton.isDisplayed()).to.eq(true);
  });

  it('should open plaid connection', () => {
    expect(ConnectBankPage.connectBankButton.isDisplayed()).to.eq(true);
    ConnectBankPage.connectBankButton.click();
    ConnectBankPage.plaidModal.waitForExist(15000);
    expect(ConnectBankPage.plaidModal.isExisting()).to.eq(true);
  });
});
