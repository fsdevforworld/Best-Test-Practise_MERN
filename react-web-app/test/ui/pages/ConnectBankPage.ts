import BasePage from './BasePage';
import VerifyCodePage from './VerifyCodePage';
import RegistrationPage from './RegistrationPage';
import i from './helpers';

class ConnectBankPage extends BasePage {
  public navigateToConnectBankPage() {
    RegistrationPage.enterPhoneNumberAndJoin(i.generatePhoneNumber());
    VerifyCodePage.verifyCode(VerifyCodePage.devSixDigitCode);
    this.whyDoYouNeedMyBankLink.waitForDisplayed(3000);
  }

  public open() {
    return browser.url('/register/bank-connect');
  }

  get connectBankPage() {
    return browser.react$('TwoColumnLayout', { backgroundImage: 'BankConnectBg' });
  }

  get connectBankButton() {
    return browser.react$('button', { title: 'Connect bank' });
  }

  get whyDoYouNeedMyBankLink() {
    return $('p=Why do you need my bank?');
  }

  get plaidModal() {
    return browser.react$('PlaidModal');
  }

  get whyDoYouNeedMyBankModalVisible() {
    return browser.react$('WhyConnectModal', { showModal: true });
  }

  get closeModalIcon() {
    return browser.react$('icon', { name: 'x' });
  }

  get arrowRightIcon() {
    return browser.react$('icon', { name: 'arrowRight' });
  }
}

export default new ConnectBankPage();
