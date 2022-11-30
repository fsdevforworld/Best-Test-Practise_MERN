const titleText = 'Set your new password';

const getPasswordForm = () => {
  return cy.react('PasswordInput').get('[type=password]').eq(0);
};

const getConfirmedPasswordForm = () => {
  return cy.react('ConfirmPasswordInput').get('[type=password]').eq(1);
};

const submitButton = () => {
  return cy.react('button').eq(1);
};

const title = () => {
  return cy.react('h1');
};

const passwordHelper = () => {
  return cy.react('PasswordHelper');
};

const confirmPasswordError = () => {
  return cy.react('ConfirmPasswordHelper');
};

const inputPassword = (pass: string, confirmPass: string) => {
  getPasswordForm().click().type(pass);
  getConfirmedPasswordForm().click().type(confirmPass);
  title().click();
};

export {
  titleText,
  passwordHelper,
  getPasswordForm,
  getConfirmedPasswordForm,
  submitButton,
  title,
  confirmPasswordError,
  inputPassword,
};
