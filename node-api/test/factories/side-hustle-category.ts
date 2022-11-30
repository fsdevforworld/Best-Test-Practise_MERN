import { SideHustleCategory } from '../../src/models';
import { HustleCategory } from '@dave-inc/wire-typings';

export default function(factory: any) {
  factory.define('side-hustle-category', SideHustleCategory, {
    name: HustleCategory.ACCOUNTING,
    priority: 10,
  });
  factory.extend('side-hustle-category', 'transportation-hustle-category', {
    name: HustleCategory.TRANSPORTATION,
    priority: 0,
    image: 'https://transportation-logo.com',
  });
  factory.extend('side-hustle-category', 'retail-hustle-category', {
    name: HustleCategory.RETAIL,
    priority: 0,
    image: 'https://retail-logo.com',
  });
}
