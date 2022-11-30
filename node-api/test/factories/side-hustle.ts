import { HustlePartner } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import * as Faker from 'faker';
import { SideHustle } from '../../src/models';

function selectRandomHustlePartner(): HustlePartner {
  const partners = [HustlePartner.Dave, HustlePartner.Appcast];
  return partners[Math.floor(Math.random() * partners.length)];
}

export default function(factory: any) {
  const partner = selectRandomHustlePartner();
  factory.define('side-hustle', SideHustle, {
    name: Faker.name.jobTitle,
    company: Faker.company.companyName,
    isActive: 1,
    externalId: () => Faker.random.alphaNumeric(26),
    partner,
    city: partner === HustlePartner.Appcast ? Faker.address.city : null,
    state: partner === HustlePartner.Appcast ? Faker.address.stateAbbr : null,
    postedDate: partner === HustlePartner.Appcast ? moment().subtract(1, 'week') : null,
  });
  factory.extend('side-hustle', 'dave-hustle', {
    name: 'Instacart Shopper',
    company: 'Instacart',
    description:
      "Have a car? Get paid to shop. You'll just need to fill out basic info like where you live and what phone you have.",
    isActive: 1,
    logo:
      'https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/instacart.jpg',
    affiliateLink:
      'http://instacart-shoppers.sjv.io/c/1297951/471903/8281?subId1=USER_ID&sharedid=000_Dave.com',
    externalId: 'instacart',
    partner: HustlePartner.Dave,
    sideHustleCategoryId: factory.assoc('transportation-hustle-category', 'id'),
    postedDate: null,
    costPerClick: 1,
    costPerApplication: 15,
    city: null,
    state: null,
    country: null,
    zipCode: null,
  });
  factory.extend('side-hustle', 'appcast-hustle', {
    name: 'Retail Sales Associate',
    company: 'Bed Bath & Beyond',
    description: 'We live by a promise to our customers that we make it easy to feel at home. We are excited to re-open our stores across the U.S and Canada and to welcome back our customers and new associates.\n\nWe’ve made enhancements to our store environment and implemented health and safety best practices to ensure a clean and safe shopping environment for customers and a safe workplace for our associates.\n\nHere are some examples of the things that we are doing to make it easy to feel safe at work too.\n•\tReduced Hours\n•\tAssociate temperature checks before the start of every shift\n•\tProviding our associates with public health guidance safety training recommendations \n        and recommended supplies for use at work\n•\tSocial distancing measures ensured in workspaces and breakrooms\n•\tGuidance provided to our customers for their safety and yours\n•\tProtective barriers at cash registers\n•\tAll stores follow rigorous cleaning procedures recommended by the public health \n       guidance association<p>As a Sales Associate, you will be responsible for exceeding our customers’ evolving expectations by providing “best in class” customer service and a pleasant and fulfilling shopping experience.  Successful candidates will be given the opportunity to offer our customers the widest range of quality housewares, home furnishings and much more!  We offer associate discounts, flexible schedules, ongoing training, and the potential for advancement.</p><p></p><p>The Sales Associate is expected to engage customers to determine their needs and direct them to the appropriate merchandise while providing product knowledge and offering additional goods and services. In this role you will be expected to meet sales and productivity goals and you will work directly as a consultant to customers who want to create wedding and gift registries.<br /><br /><b><u>Key Responsibilities:</u></b><br />• Engage customers in a courteous, helpful, and respectful manner, promptly and politely responds to customer inquiries and customer requests for support<br />• Escort customers to appropriate merchandise<br />• Explain basic features of merchandise to customers<br />• Resolve customer issues and escalates issues as necessary to ensure customer satisfaction<br />• Organize and straighten merchandise areas on the sales floor<br />• Process customer transactions through the register as required<br />• Execute activities related to store initiatives to offer customers additional products and services (e.g., special sale items, credit card applications)<br />• Assist customers in creating registries, as needed<br />• Perform additional, sometimes specialized duties as required by business needs including, but not limited to, stocking, freight processing, fulfillment, and price changes, cart retrieval and cashiering<br /><br /><b><u>Education/Experience/Qualifications:</u></b><br />• High School diploma or equivalent<br />• 1 year of retail experience desired<br />• Effective communication and customer service skills<br />• Readily adjusts schedule, tasks, and priorities when necessary to meet business needs</p>'.substr(
      0,
      500,
    ),
    isActive: 1,
    logo: 'https://logo.appcast.io/bedbath&beyond.com',
    affiliateLink:
      'https://click.appcast.io/track/4cfktgw?cs=i3h&exch=1&jg=1fzp&bid=TEz0xVerpiuhxLt0LS4mUA==&sar_id=ou9nyk&jpos=1',
    externalId: '3433_R-0077143',
    partner: HustlePartner.Appcast,
    sideHustleCategoryId: factory.assoc('retail-hustle-category', 'id'),
    postedDate: moment('2020-08-20T00:00:00Z').format(),
    costPerClick: 0.24,
    costPerApplication: 0.58,
    city: 'Chyenne',
    state: 'WY',
    zipCode: '82009',
    country: 'United States',
  });
}
