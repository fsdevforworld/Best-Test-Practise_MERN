import * as faker from 'faker/locale/en_US';

export class Helpers {
  public generatePhoneNumber() {
    return faker.phone.phoneNumber().replace(/\D/g, '').slice(0, 10);
  }

  public generateFirstName() {
    return faker.name.firstName();
  }

  public generateLastName() {
    return faker.name.lastName();
  }

  public generateEmail() {
    return faker.internet.email();
  }

  public generatePassword() {
    return faker.internet.password();
  }
}

const i: Helpers = new Helpers();
export default i;
