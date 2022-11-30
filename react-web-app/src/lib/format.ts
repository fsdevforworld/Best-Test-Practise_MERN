export function getDigits(value: string) {
  // @ts-ignore
  return value.match(/\d+/g) ? value.match(/\d+/g).join('') : '';
}
