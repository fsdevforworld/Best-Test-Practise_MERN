import { registrationPage } from '../../pageObjects';

describe('Registration Page', () => {
  beforeEach(() => {
    cy.visit('/register');
    cy.waitForReact();
  });

  it('should display all ui elements for registration form', () => {
    registrationPage.getFirstNameForm().should('be.visible');
    registrationPage.getLastNameForm().should('be.visible');
    registrationPage.getEmailForm().should('be.visible');
    registrationPage.getPasswordForm().should('be.visible');
    registrationPage.getMobileNumberForm().should('be.visible');
  });

  it('should display error message for first name form', () => {
    registrationPage.getFirstNameForm().click().type('1nval1d$Nam3');
    registrationPage.getPasswordForm().click();
    registrationPage
      .getFirstNameForm()
      .get('#error-helper')
      .contains(registrationPage.nameFormErrorText);
  });

  it('should display error message last name form', () => {
    registrationPage.getLastNameForm().click().type('1nval1d$Nam3');
    registrationPage.getPasswordForm().click();
    registrationPage
      .getLastNameForm()
      .get('#error-helper')
      .contains(registrationPage.nameFormErrorText);
  });

  it('should display error message email form', () => {
    registrationPage.getEmailForm().click().type('firstemailpart');
    registrationPage.getPasswordForm().click();
    registrationPage
      .getEmailForm()
      .get('#error-helper')
      .contains(registrationPage.emailFormErrorText);
  });

  it('should not activate join button when invalid phone number is used', () => {
    registrationPage.enterRegistrationInfo('123456789');
    cy.get(registrationPage.joinButton).should('be.disabled');
  });

  it('should activate join button when correct phone number is used', () => {
    registrationPage.enterRegistrationInfo('1234567890');
    cy.get(registrationPage.joinButton).should('be.enabled');
  });
});
