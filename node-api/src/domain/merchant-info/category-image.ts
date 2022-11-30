export type Category =
  | 'Healthcare'
  | 'Service'
  | 'Shops'
  | 'Food and Drink'
  | 'Transfer'
  | 'Recreation'
  | 'Travel'
  | 'Tax'
  | 'Bank Fees'
  | 'Cash Advance'
  | 'Payment'
  | 'Community'
  | 'Interest';

type ImageMap = Record<Category, string>;

const map: ImageMap = {
  Healthcare:
    'https://storage.googleapis.com/dave-images/images-production/categories/healthcare@3x.png',
  Service: 'https://storage.googleapis.com/dave-images/images-production/categories/service@3x.png',
  Shops: 'https://storage.googleapis.com/dave-images/images-production/categories/shops@3x.png',
  'Food and Drink':
    'https://storage.googleapis.com/dave-images/images-production/categories/foodAndDrink@3x.png',
  Transfer:
    'https://storage.googleapis.com/dave-images/images-production/categories/transfer@3x.png',
  Recreation:
    'https://storage.googleapis.com/dave-images/images-production/categories/recreation@3x.png',
  Travel: 'https://storage.googleapis.com/dave-images/images-production/categories/travel@3x.png',
  Tax: 'https://storage.googleapis.com/dave-images/images-production/categories/tax@3x.png',
  'Bank Fees':
    'https://storage.googleapis.com/dave-images/images-production/categories/bankFees@3x.png',
  'Cash Advance':
    'https://storage.googleapis.com/dave-images/images-production/categories/cashAdvance@3x.png',
  Payment: 'https://storage.googleapis.com/dave-images/images-production/categories/payment@3x.png',
  Community:
    'https://storage.googleapis.com/dave-images/images-production/categories/community@3x.png',
  Interest:
    'https://storage.googleapis.com/dave-images/images-production/categories/interest@3x.png',
} as const;

const defaultImage =
  'https://storage.googleapis.com/dave-images/images-production/categories/generic@2x.png';

export function getCategoryImage(key: Category) {
  if (key in map) {
    return map[key as Category];
  }
  return defaultImage;
}
