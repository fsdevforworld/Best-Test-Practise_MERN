import * as faker from 'faker/locale/en_US';

const generatePhoneNumber = () => {
  return faker.phone.phoneNumber().replace(/\D/g, '').slice(0, 10);
};

const generateFirstName = () => {
  return faker.name.firstName();
};

const generateLastName = () => {
  return faker.name.lastName();
};

const generateEmail = () => {
  return faker.internet.email();
};

const generatePassword = () => {
  return faker.internet.password();
};

export {
  generatePhoneNumber,
  generateFirstName,
  generateLastName,
  generateEmail,
  generatePassword,
};
