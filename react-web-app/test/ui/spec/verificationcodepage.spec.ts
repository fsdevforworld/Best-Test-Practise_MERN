import RegistrationPage from '../pages/RegistrationPage';
import VerifyCodePage from '../pages/VerifyCodePage';
import { expect } from 'chai';
import i from '../pages/helpers';

describe('Verify Six Digit Code Page', () => {
  beforeEach(() => {
    VerifyCodePage.open();
  });

  it('should not accept code 123456', () => {
    VerifyCodePage.verifyCode('123456');

    VerifyCodePage.incorrectCodeIcon.waitForDisplayed(1500);
    expect(VerifyCodePage.incorrectCodeIcon.isDisplayed()).to.eq(true);
  });

  it('should not accept code with letters', () => {
    VerifyCodePage.verifyCode('Dave');

    expect(VerifyCodePage.resendTheCodeButton.isDisplayed()).to.eq(true);
    expect(VerifyCodePage.incorrectCodeIcon.isDisplayed()).to.eq(false);
    expect(VerifyCodePage.verifyButton.isEnabled()).to.eq(false);
  });

  it('should open Get Help link', () => {
    VerifyCodePage.getHelpLink.click();

    expect(VerifyCodePage.resendTheCodeButton.isDisplayed()).to.eq(true);
    expect(VerifyCodePage.editNumberButton.isDisplayed()).to.eq(true);
  });

  it('should resend verification code', () => {
    RegistrationPage.enterPhoneNumberAndJoin(i.generatePhoneNumber());
    VerifyCodePage.getHelpLink.click();
    VerifyCodePage.resendTheCodeButton.click();

    expect(VerifyCodePage.checkInCircleIcon.isDisplayed()).to.eq(true);
  });

  it('should redirect user to edit number', () => {
    VerifyCodePage.getHelpLink.click();
    VerifyCodePage.editNumberButton.click();

    expect(RegistrationPage.disclaimer.isDisplayed()).to.eq(true);
  });
});
