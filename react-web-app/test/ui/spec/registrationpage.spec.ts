import { expect } from 'chai';
import RegistrationPage from '../pages/RegistrationPage';

describe('Registration Page', () => {
  beforeEach(() => {
    RegistrationPage.open();
  });

  it('should have all ui elements', () => {
    expect(RegistrationPage.firstNameTextInput.isDisplayed()).to.be.true;
    expect(RegistrationPage.lastNameTextInput.isDisplayed()).to.be.true;
    expect(RegistrationPage.mobileNumberTextInput.isDisplayed()).to.be.true;
    expect(RegistrationPage.emailAddressTextInput.isDisplayed()).to.be.true;
    expect(RegistrationPage.passwordTextInput.isDisplayed()).to.be.true;
    expect(RegistrationPage.disclaimer.getText()).to.eq(RegistrationPage.disclaimerText);
  });

  it('should show error messages', () => {
    RegistrationPage.firstNameTextInput.click();
    browser.keys('1nval1d$Nam3');
    RegistrationPage.lastNameTextInput.click();
    browser.keys('1nval1d$Nam3');
    RegistrationPage.emailAddressTextInput.click();
    browser.keys('firstpartofemail');
    RegistrationPage.passwordTextInput.click();
    expect(RegistrationPage.firstNameTextInput.$('#error-helper').getText()).to.eq(
      "Alphabetical characters, hyphens (-), apostrophes ('), and spaces ( ) only.",
    );
    expect(RegistrationPage.lastNameTextInput.$('#error-helper').getText()).to.eq(
      "Alphabetical characters, hyphens (-), apostrophes ('), and spaces ( ) only.",
    );
    expect(RegistrationPage.emailAddressTextInput.$('#error-helper').getText()).to.eq(
      'Please provide a valid email address.',
    );
  });

  it('should not activate join button when invalid phone number used', () => {
    RegistrationPage.enterRegistrationInfo('123456789');
    expect(RegistrationPage.joinButton.isEnabled()).to.eq(false);
  });

  it('should activate join button when correct phone number used', () => {
    RegistrationPage.enterRegistrationInfo('1234567890');
    expect(RegistrationPage.joinButton.isEnabled()).to.be.true;
  });
});
