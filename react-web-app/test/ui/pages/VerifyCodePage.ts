import BasePage from './BasePage';

class VerifyCodePage extends BasePage {
  public open() {
    return browser.url('/register/verification-code');
  }

  get verificationInput() {
    return browser.react$('input', { title: 'Enter code' });
  }

  get verifyButton() {
    return browser.react$('button', { title: 'Verify' });
  }

  get thisCodeIsIncorrectText() {
    return browser.react$('input', { errorHelperText: 'That code is incorrect, try again.' });
  }

  get incorrectCodeIcon() {
    return browser.react$('icon', { name: 'warning' });
  }

  get getHelpLink() {
    return $('p=Get help');
  }

  get resendTheCodeButton() {
    return browser.react$('button', { title: 'Resend the code' });
  }

  get editNumberButton() {
    return browser.react$('button', { title: 'Edit number' });
  }

  public verifyCode(code: string) {
    this.verificationInput.click();
    browser.keys(code);
    this.verifyButton.click();
  }
}

export default new VerifyCodePage();
