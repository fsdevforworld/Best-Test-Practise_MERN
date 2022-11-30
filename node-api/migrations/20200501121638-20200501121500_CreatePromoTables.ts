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

export async function up(db: DBItem) {
  await db.runSql(
    'CREATE TABLE `promo`(\
      `id` int(11) NOT NULL AUTO_INCREMENT,\
      `trigger` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\
      `reward` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\
      `redeemable_amount` int(11) DEFAULT NULL,\
      `deleted` datetime DEFAULT NULL,\
      `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
      `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
      PRIMARY KEY (`id`),\
      KEY `deletedx` (`deleted`)\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  );
  await db.runSql(
    'CREATE TABLE `promo_campaign` (\
      `id` int(11) NOT NULL AUTO_INCREMENT,\
      `promo_id` int(11) NOT NULL,\
      `start_date` datetime NOT NULL,\
      `end_date` datetime NOT NULL,\
      `campaign_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\
      `external_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\
      `deleted` datetime DEFAULT NULL,\
      `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
      `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
      PRIMARY KEY (`id`),\
      KEY `campaign_promo_id_fk` (`promo_id`),\
      KEY `external_idx` (`external_id`),\
      KEY `deletedx` (`deleted`),\
      CONSTRAINT `campaign_promo_id_fk` FOREIGN KEY (`promo_id`) REFERENCES `promo` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  );
  await db.runSql(
    'CREATE TABLE `promo_redemption` (\
        `id` int(11) NOT NULL AUTO_INCREMENT,\
        `user_id` int(11) NOT NULL,\
        `promo_campaign_id` int(11) NOT NULL,\
        `snapshot` json,\
        PRIMARY KEY (`id`),\
        KEY `promo_redemption_promo_campaign_id_fk` (`promo_campaign_id`),\
        KEY `promo_redemption_user_id` (`user_id`),\
        CONSTRAINT `promo_redemption_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\
        CONSTRAINT `promo_redemption_promo_campaign_id_fk` FOREIGN KEY (`promo_campaign_id`) REFERENCES `promo_campaign` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS `promo_redemption`;');
  await db.runSql('DROP TABLE IF EXISTS `promo_campaign`;');
  await db.runSql('DROP TABLE IF EXISTS `promo`;');
}

export const _meta = {
  version: 1,
};
