export function getCategory(bankTransaction: { plaidCategory?: string[] }): string {
  return bankTransaction?.plaidCategory?.[0] ?? '';
}

export function getSubCategory(bankTransaction: { plaidCategory?: string[] }): string {
  return bankTransaction?.plaidCategory?.[1] ?? '';
}
