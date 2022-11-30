const usTerritories = ['AS', 'GU', 'MH', 'MP', 'PW', 'VI', 'PR'];

export function mapCountryCodeFromState(stateCode: string): string {
  return stateCode && usTerritories.includes(stateCode.toUpperCase())
    ? stateCode.toUpperCase()
    : 'US';
}
