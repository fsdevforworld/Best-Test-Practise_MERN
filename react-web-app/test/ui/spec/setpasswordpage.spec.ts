import { expect } from 'chai';
import SetPasswordPage from '../pages/SetPasswordPage';

describe('Set Passwrod Page', () => {
  beforeEach(() => {
    SetPasswordPage.open();
  });

  it('should have all ui elements', () => {
    expect(SetPasswordPage.passwordTextInput.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.confirmPasswordTextInput.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.submitButton.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.title.getText()).to.eq(SetPasswordPage.titleText);
  });

  it('should not activate join button when only the new password is entered', () => {
    SetPasswordPage.passwordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.title.click();

    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(false);
    expect(SetPasswordPage.passwordHelper.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.confirmPasswordError.isDisplayed()).to.eq(false);
  });

  it('should not activate join button when only the confirm password is entered', () => {
    SetPasswordPage.confirmPasswordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.title.click();

    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(false);
    expect(SetPasswordPage.passwordHelper.isDisplayed()).to.eq(false);
    expect(SetPasswordPage.confirmPasswordError.isDisplayed()).to.eq(true);
  });

  it('should not activate join button when passwords do not match', () => {
    SetPasswordPage.passwordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.confirmPasswordTextInput.click();
    browser.keys('Someotherpassword2');
    SetPasswordPage.title.click();

    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(false);
    expect(SetPasswordPage.passwordHelper.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.confirmPasswordError.isDisplayed()).to.eq(true);
  });

  it('should not activate join button when new password is invalid', () => {
    SetPasswordPage.passwordTextInput.click();
    browser.keys('PasswordIncorrect');
    SetPasswordPage.confirmPasswordTextInput.click();
    browser.keys('PasswordIncorrect');
    SetPasswordPage.title.click();
    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(false);
    expect(SetPasswordPage.passwordHelper.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.confirmPasswordError.isDisplayed()).to.eq(false);
  });

  it('should activate join button when both passwords are entered and match', () => {
    SetPasswordPage.passwordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.confirmPasswordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.title.click();

    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(true);
    expect(SetPasswordPage.passwordHelper.isDisplayed()).to.eq(true);
    expect(SetPasswordPage.confirmPasswordError.isDisplayed()).to.eq(false);
  });

  it('should show error modal when link is not valid', () => {
    SetPasswordPage.passwordTextInput.click();
    browser.keys('Password1!');
    SetPasswordPage.confirmPasswordTextInput.click();
    browser.keys('Password1!');

    expect(SetPasswordPage.submitButton.isEnabled()).to.eq(true);
    SetPasswordPage.submitButton.click();
    SetPasswordPage.errorModalVisible.waitForExist();
    expect(SetPasswordPage.errorModalVisible.isDisplayed()).to.eq(true);
  });
});
