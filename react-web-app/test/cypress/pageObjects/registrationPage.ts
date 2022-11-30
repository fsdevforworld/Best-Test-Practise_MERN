import { generateFirstName, generateLastName, generateEmail } from './helper';

const firstNameFormText = 'First name';
const lastNameFormText = 'Last name';
const emailFormText = 'Email address';
const mobileFormText = 'Mobile number';
const nameFormErrorText =
  "Alphabetical characters, hyphens (-), apostrophes ('), and spaces ( ) only.";
const emailFormErrorText = 'Please provide a valid email address.';
const joinButton = '[type=button]';

const getFirstNameForm = () => {
  return cy.react('InputComponent', { props: { title: firstNameFormText } });
};

const getLastNameForm = () => {
  return cy.react('InputComponent', { props: { title: lastNameFormText } });
};

const getEmailForm = () => {
  return cy.react('InputComponent', { props: { title: emailFormText } });
};

const getMobileNumberForm = () => {
  return cy.react('InputComponent', { props: { title: mobileFormText } });
};

const getPasswordForm = () => {
  return cy.react('PasswordInput');
};

const enterRegistrationInfo = (password: string) => {
  cy.react('InputComponent', { props: { title: firstNameFormText } })
    .click()
    .type(generateFirstName());
  cy.react('InputComponent', { props: { title: lastNameFormText } })
    .click()
    .type(generateLastName());
  cy.react('InputComponent', { props: { title: emailFormText } })
    .click()
    .type(generateEmail());
  cy.react('PasswordInput').get('[type=password]').click().type('Password1!');
  cy.react('InputComponent', { props: { title: mobileFormText } })
    .click()
    .type(password);
};

export {
  firstNameFormText,
  lastNameFormText,
  emailFormText,
  mobileFormText,
  nameFormErrorText,
  emailFormErrorText,
  joinButton,
  getFirstNameForm,
  getLastNameForm,
  getPasswordForm,
  getEmailForm,
  getMobileNumberForm,
  enterRegistrationInfo,
};
