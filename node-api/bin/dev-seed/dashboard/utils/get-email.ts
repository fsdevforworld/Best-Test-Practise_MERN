function getEmail(phoneNumberSeed: string, email: string) {
  return `${phoneNumberSeed}-${email}`;
}

export default getEmail;
