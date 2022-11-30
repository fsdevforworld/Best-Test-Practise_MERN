import { setPasswordPage } from '../../pageObjects';

describe('Set Password Page', () => {
  const password = 'Password1!';
  const incorrectPassword = 'PasswordIncorrect';

  beforeEach(() => {
    cy.visit('/set-password?token=sometoken&email=someemail&isResetPassword=true');
    cy.waitForReact();
  });

  it('should display all ui elements', () => {
    setPasswordPage.getPasswordForm().should('be.visible');
    setPasswordPage.title().should('be.visible');
    setPasswordPage.getConfirmedPasswordForm().should('be.visible');
    setPasswordPage.submitButton().should('be.visible');
  });

  it('should not activate join button when only the new password is entered', () => {
    setPasswordPage.getPasswordForm().click().type(password);
    setPasswordPage.title().click();
    setPasswordPage.submitButton().should('be.disabled');
    setPasswordPage.passwordHelper().should('be.visible');
    cy.get(setPasswordPage.confirmPasswordError()).should('not.be.visible');
  });

  it('should not activate join button when only the confirm password is entered', () => {
    setPasswordPage.getConfirmedPasswordForm().click().type(password);
    setPasswordPage.title().click();
    setPasswordPage.submitButton().should('be.disabled');
    cy.get(setPasswordPage.passwordHelper()).should('not.be.visible');
    setPasswordPage.confirmPasswordError().should('be.visible');
  });

  it('should not activate join button when passwords do not match', () => {
    setPasswordPage.inputPassword(password, 'Password2@');
    setPasswordPage.submitButton().should('be.disabled');
    setPasswordPage.passwordHelper().should('be.visible');
    setPasswordPage.confirmPasswordError().should('be.visible');
  });

  it('should not activate join button when new password is invalid', () => {
    setPasswordPage.inputPassword(incorrectPassword, incorrectPassword);
    setPasswordPage.submitButton().should('be.disabled');
    setPasswordPage.passwordHelper().should('be.visible');
    cy.get(setPasswordPage.confirmPasswordError()).should('not.be.visible');
  });

  it('should activate join button when both passwords are entered and match', () => {
    setPasswordPage.inputPassword(password, password);
    setPasswordPage.submitButton().should('be.enabled');
    setPasswordPage.passwordHelper().should('be.visible');
    cy.get(setPasswordPage.confirmPasswordError()).should('not.be.visible');
  });
});
