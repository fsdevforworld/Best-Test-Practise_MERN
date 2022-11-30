import BasePage from './BasePage';

class SetPasswordPage extends BasePage {
  public open() {
    return browser.url('/set-password?token=sometoken&email=someemail&isResetPassword=true');
  }

  get passwordTextInput() {
    return browser.react$('PasswordInput');
  }

  get passwordHelper() {
    return browser.react$('PasswordHelper');
  }

  get confirmPasswordTextInput() {
    return browser.react$('ConfirmPasswordInput');
  }

  get confirmPasswordError() {
    return browser.react$('ConfirmPasswordHelper');
  }

  get submitButton() {
    return browser.react$('button');
  }

  get title() {
    return browser.react$('h1');
  }

  get titleText() {
    return 'Set your new password';
  }

  get errorModalVisible() {
    return browser.react$('ErrorModal', { isVisible: true });
  }
}

export default new SetPasswordPage();
