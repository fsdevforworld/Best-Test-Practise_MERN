import BasePage from './BasePage';
import i from './helpers';

class RegistrationPage extends BasePage {
  public open() {
    return browser.url('/register');
  }

  get firstNameTextInput() {
    return browser.react$('InputComponent', { title: 'First name' });
  }

  get lastNameTextInput() {
    return browser.react$('InputComponent', { title: 'Last name' });
  }

  get mobileNumberTextInput() {
    return browser.react$('InputComponent', { title: 'Mobile number' });
  }

  get emailAddressTextInput() {
    return browser.react$('InputComponent', { title: 'Email address' });
  }

  get passwordTextInput() {
    return browser.react$('PasswordInput');
  }

  get joinButton() {
    return browser.react$('button');
  }

  get disclaimer() {
    return browser.react$('Disclaimer');
  }

  get disclaimerText() {
    return "We don't sell your data to any third parties. By joining, I agree to Dave's Privacy Policy, TOS, Payment Authorization & Electronic Communication Consent";
  }

  public enterRegistrationInfo(phoneNumber: string) {
    this.firstNameTextInput.click();
    browser.keys(i.generateFirstName());
    this.lastNameTextInput.click();
    browser.keys(i.generateLastName());
    this.emailAddressTextInput.click();
    browser.keys(i.generateEmail());
    this.passwordTextInput.click();
    browser.keys('Password1!');
    this.mobileNumberTextInput.click();
    browser.keys(phoneNumber);
  }

  public enterPhoneNumberAndJoin(phoneNumber: string) {
    this.open();
    this.enterRegistrationInfo(phoneNumber);
    this.joinButton.click();
  }
}

export default new RegistrationPage();
