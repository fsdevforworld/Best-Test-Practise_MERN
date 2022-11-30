import { getDigits } from 'lib/format';

export const isNameValid = (name: string) => {
  // allow upper/lowercase and hyphens
  const nameRegex = /^[a-zA-Z\-'\s]{2,256}$/;

  return nameRegex.test(name);
};

export const isPhoneNumberValid = (phoneNumber: string): boolean => {
  return getDigits(phoneNumber).length === 10;
};

export const isVerificationCodeValid = (verificationCode: string): boolean => {
  return getDigits(verificationCode).length === 6;
};

export function isEmailValid(email: string) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  return re.test(String(email).toLowerCase());
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function hasAnUpperCaseLetter(password: string) {
  return password !== password.toLowerCase() && password.length > 0;
}

export function hasALowerCaseLetter(password: string) {
  return password !== password.toUpperCase() && password.length > 0;
}

export function hasNumber(password: string) {
  const re = /\d/;
  return re.test(String(password));
}

export function hasMinLength(password: string) {
  return password.length >= 8;
}

export function hasASpecialCharacter(password: string) {
  const re = /[ !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/;
  return re.test(String(password));
}
