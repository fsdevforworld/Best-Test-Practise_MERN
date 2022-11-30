import { createContext } from 'react';

export type RegistrationValues = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
};

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  password: '',
};

const RegistrationContext = createContext<RegistrationValues>(emptyForm);

export default RegistrationContext;
