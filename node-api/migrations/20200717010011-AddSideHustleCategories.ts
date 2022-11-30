import { DBItem, DBType } from 'db-migrate';

export let dbm: any;
export let type: DBType;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
export function setup(options: any): void {
  dbm = options.dbmigrate;
  type = dbm.dataType;
}

const categoryArray: Array<Partial<string>> = [
  'Accounting',
  'Admin',
  'Clerical',
  'Advertising',
  'Public Relations',
  'Automotive',
  'Aviation',
  'Banking',
  'Biotechnology',
  'Pharmaceutical',
  'Building Facilities',
  'Business Opportunity',
  'Childcare',
  'Communications',
  'Media',
  'Writers',
  'Construction',
  'Trades',
  'Consultant',
  'Customer Service',
  'Education',
  'Emergency',
  'Fire',
  'Engineering',
  'Executive',
  'Government',
  'Military Healthcare',
  'Healthcare',
  'Allied Health Healthcare',
  'Nursing Healthcare',
  'Physicians Hospitality',
  'Design',
  'Finance',
  'Hourly',
  'HR',
  'Insurance',
  'Journalism',
  'Law Enforcement',
  'Manufacturing',
  'Production',
  'Marketing',
  'Non-Profit',
  'Oil',
  'Energy',
  'Power',
  'Real Estate',
  'Restaurant',
  'Legal',
  'Salon',
  'Beauty',
  'Fitness',
  'Retail',
  'Sales',
  'Science',
  'Security',
  'Social Services',
  'Supply Chain',
  'Logistics',
  'Technology',
  'Telecommunications',
  'Transportation',
  'Travel',
  'Tourism',
  'Vet',
  'Animal Services',
  'Default',
];

const categoryImageMap: Map<string, string> = new Map()
  .set(
    'Accounting',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Accounting%403x.png',
  )
  .set(
    'Admin',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Admin-Clerical-Advertising%403x.png',
  )
  .set(
    'Clerical',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Admin-Clerical-Advertising%403x.png',
  )
  .set(
    'Advertising',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Admin-Clerical-Advertising%403x.png',
  )
  .set(
    'Public Relations',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Public-Relations%403x.png',
  )
  .set(
    'Automotive',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/automotive%403x.png',
  )
  .set(
    'Aviation',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Aviation%403x.png',
  )
  .set(
    'Banking',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Banking%403x.png',
  )
  .set(
    'Biotechnology',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Biotechnology%403x.png',
  )
  .set(
    'Pharmaceutical',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Pharmaceutical%403x.png',
  )
  .set(
    'Building Facilities',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Facilities%403x.png',
  )
  .set(
    'Business Opportunity',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Business-Opportunity%403x.png',
  )
  .set(
    'Childcare',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Childcare%403x.png',
  )
  .set(
    'Communications',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Communications-media.%403x.png',
  )
  .set(
    'Media',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Communications-media.%403x.png',
  )
  .set(
    'Writers',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Writers%403x.png',
  )
  .set(
    'Construction',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Construction%403x.png',
  )
  .set(
    'Trades',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Trades%403x.png',
  )
  .set(
    'Consultant',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Consultant%403x.png',
  )
  .set(
    'Customer Service',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Customer-Service%403x.png',
  )
  .set(
    'Education',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Education%403x.png',
  )
  .set(
    'Emergency',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Emergency%403x.png',
  )
  .set(
    'Fire',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Fire%403x.png',
  )
  .set(
    'Engineering',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Engineering%403x.png',
  )
  .set(
    'Executive',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Executive%403x.png',
  )
  .set(
    'Government',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Government-Military%20Healthcare%403x.png',
  )
  .set(
    'Military Healthcare',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Government-Military%20Healthcare%403x.png',
  )
  .set(
    'Healthcare',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Healthcare%403x.png',
  )
  .set(
    'Allied Health Healthcare',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Healthcare%403x.png',
  )
  .set(
    'Nursing Healthcare',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Healthcare%403x.png',
  )
  .set(
    'Physicians Hospitality',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Healthcare%403x.png',
  )
  .set(
    'Design',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Design%403x.png',
  )
  .set(
    'Finance',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Finance%403x.png',
  )
  .set(
    'Hourly',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Hourly%403x.png',
  )
  .set(
    'HR',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/HR%403x.png',
  )
  .set(
    'Insurance',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Insurance%403x.png',
  )
  .set(
    'Journalism',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Journalism%403x.png',
  )
  .set(
    'Law Enforcement',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Law-Enforcement%403x.png',
  )
  .set(
    'Manufacturing',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Manufacturing-Production%403x.png',
  )
  .set(
    'Production',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Manufacturing-Production%403x.png',
  )
  .set(
    'Marketing',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Marketing%403x.png',
  )
  .set(
    'Non-Profit',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Non-Profit%403x.png',
  )
  .set(
    'Oil',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Oil%403x.png',
  )
  .set(
    'Energy',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Energy%403x.png',
  )
  .set(
    'Power',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Power%403x.png',
  )
  .set(
    'Real Estate',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Real-estate%403x.png',
  )
  .set(
    'Restaurant',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Restaurant%403x.png',
  )
  .set(
    'Legal',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Legal%403x.png',
  )
  .set(
    'Salon',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Salon-Beauty%403x.png',
  )
  .set(
    'Beauty',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Salon-Beauty%403x.png',
  )
  .set(
    'Fitness',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Fitness%403x.png',
  )
  .set(
    'Retail',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Retail%403x.png',
  )
  .set(
    'Sales',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Sales%403x.png',
  )
  .set(
    'Science',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Science%403x.png',
  )
  .set(
    'Security',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Security%403x.png',
  )
  .set(
    'Social Services',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Social-Services%403x.png',
  )
  .set(
    'Supply Chain',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Supply-chain-Logistics%403x.png',
  )
  .set(
    'Logistics',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Supply-chain-Logistics%403x.png',
  )
  .set(
    'Technology',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Technology%403x.png',
  )
  .set(
    'Telecommunications',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Telecommunications%403x.png',
  )
  .set(
    'Transportation',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Transportation%403x.png',
  )
  .set(
    'Travel',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Travel-Tourism%403x.png',
  )
  .set(
    'Tourism',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Travel-Tourism%403x.png',
  )
  .set(
    'Vet',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Vet%403x.png',
  )
  .set(
    'Animal Services',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Animal-Services%403x.png',
  )
  .set(
    'Default',
    'https://storage.cloud.google.com/dave-images/images-production/hustle/categories/Business-Opportunity%403x.png',
  );

export async function up(db: DBItem) {
  const INSERT_CATEGORIES = categoryArray.reduce(
    (queryAccumulator, categoryName, categoryIndex) => {
      queryAccumulator +=
        categoryIndex < categoryArray.length - 1
          ? `( "${categoryName}", 0 , "${categoryImageMap.get(categoryName)}" ) , `
          : `( "${categoryName}", 0 , "${categoryImageMap.get(categoryName)}" )`;
      return queryAccumulator;
    },
    'INSERT into side_hustle_category (name, priority, image ) VALUES ',
  );
  await db.runSql(INSERT_CATEGORIES);
}

export async function down(db: DBItem): Promise<void> {
  await Promise.all(
    categoryArray.map(categoryName =>
      db.runSql(`DELETE FROM side_hustle_category WHERE name=? AND priority=? AND image=?`, [
        categoryName,
        0,
        categoryImageMap.get(categoryName),
      ]),
    ),
  );
}

export const _meta = {
  version: 1,
};
