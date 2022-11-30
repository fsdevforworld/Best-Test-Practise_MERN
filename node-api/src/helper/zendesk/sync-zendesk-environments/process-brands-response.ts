import { generateRandomNumber } from '../../../lib/utils';
import { Brand } from './typings';

function createRandomSuffix(leadingWord: string = 'sandbox', numDigits: number = 6): string {
  return `${leadingWord}-${generateRandomNumber(numDigits)}`;
}

function cloneBrandWithNewSubdomain(brand: Brand, subdomainSuffix: string): Brand {
  // Zendesk API won't create brands that have a subdomain or host-mapping that already exists
  delete brand.host_mapping;
  return {
    ...brand,
    subdomain: `${brand.subdomain}-${subdomainSuffix}`,
  };
}

export default async function processBrandsResponse(brands: Brand[]): Promise<Brand[]> {
  return brands.map((brand: Brand) => {
    const randomSubdomainSuffix = createRandomSuffix();
    return cloneBrandWithNewSubdomain(brand, randomSubdomainSuffix);
  });
}
