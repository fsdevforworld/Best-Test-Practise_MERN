-- MySQL dump 10.13  Distrib 8.0.19, for osx10.15 (x86_64)
--
-- Host: 127.0.0.1    Database: dave_dev
-- ------------------------------------------------------
-- Server version	5.7.26
SET TIME_ZONE='+00:00';
SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

DROP DATABASE IF EXISTS dave_dev;
CREATE DATABASE dave_dev;
USE dave_dev;

--
-- Table structure for table `ab_testing_event`
--

DROP TABLE IF EXISTS `ab_testing_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ab_testing_event` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `event_uuid` bigint(20) DEFAULT NULL,
  `event_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extra` json DEFAULT NULL,
  `variables` json DEFAULT NULL,
  `results` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ab_testing_event_user_id` (`user_id`),
  KEY `ab_testing_event_event_uuid` (`event_uuid`),
  KEY `ab_testing_event_event_name` (`event_name`),
  KEY `ab_testing_event_user_id_event_name_idx` (`user_id`,`event_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ab_testing_event`
--


--
-- Table structure for table `accounting_ledger`
--

DROP TABLE IF EXISTS `accounting_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounting_ledger` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `advance_id` int(11) NOT NULL,
  `plaid_item_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost` decimal(16,2) NOT NULL,
  `merchant` enum('PLAID','TABAPAY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('PLAID_TRANSACTIONS','PLAID_AUTH','PLAID_REALTIME_BALANCE','TABAPAY_DISBURSE','TABAPAY_PAYMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `extras` json NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounting_ledger`
--


--
-- Table structure for table `admin_comment`
--

DROP TABLE IF EXISTS `admin_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_comment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `author_id` int(11) NOT NULL,
  `message` varchar(5000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  `is_high_priority` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_comment`
--


--
-- Table structure for table `admin_paycheck_override`
--

DROP TABLE IF EXISTS `admin_paycheck_override`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_paycheck_override` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `creator_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `pay_date` date NOT NULL,
  `note` varchar(8192) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supporting_document_1` blob,
  `supporting_document_2` blob,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `admin_paycheck_override_bank_account_id_fk` (`bank_account_id`),
  KEY `admin_paycheck_override_user_id_fk` (`user_id`),
  CONSTRAINT `admin_paycheck_override_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `admin_paycheck_override_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_paycheck_override`
--


--
-- Table structure for table `advance`
--

DROP TABLE IF EXISTS `advance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) DEFAULT NULL,
  `payment_method_id` int(11) DEFAULT NULL,
  `payback_frozen` tinyint(1) NOT NULL DEFAULT '0',
  `external_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `fee` decimal(16,2) NOT NULL DEFAULT '0.00',
  `outstanding` decimal(16,2) NOT NULL,
  `disbursement_status` enum('PENDING','UNKNOWN','COMPLETED','RETURNED','CANCELED','NOTDISBURSED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payback_date` date DEFAULT NULL,
  `legacy_id` int(11) DEFAULT NULL,
  `disbursement_processor` enum('TABAPAY','SYNAPSEPAY','BANK_OF_DAVE','RISEPAY','BLASTPAY','PAYFI') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `collection_in_progress` tinyint(1) NOT NULL DEFAULT '0',
  `delivery` enum('STANDARD','EXPRESS') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modifications` json DEFAULT NULL,
  `created_date` date NOT NULL,
  `screenshot_image` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disbursement_bank_transaction_id` bigint(20) DEFAULT NULL,
  `reference_id` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chosen_advance_approval_id` int(11) DEFAULT NULL,
  `deleted` datetime NOT NULL DEFAULT '9999-12-31 23:59:59',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id_created_date_deleted_uix` (`user_id`,`created_date`,`deleted`),
  UNIQUE KEY `external_id` (`external_id`),
  KEY `advance_payment_method_id_fk` (`payment_method_id`),
  KEY `advance_bank_account_id_fk` (`bank_account_id`),
  KEY `advance_disbursement_bank_transaction_id_fk` (`disbursement_bank_transaction_id`),
  KEY `advance_reference_id_idx` (`reference_id`),
  KEY `advance_chosen_advance_approval_id_fk` (`chosen_advance_approval_id`),
  KEY `advance_disbursement_status` (`disbursement_status`),
  CONSTRAINT `advance_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `advance_chosen_advance_approval_id_fk` FOREIGN KEY (`chosen_advance_approval_id`) REFERENCES `advance_approval` (`id`) ON DELETE SET NULL,
  CONSTRAINT `advance_disbursement_bank_transaction_id_fk` FOREIGN KEY (`disbursement_bank_transaction_id`) REFERENCES `bank_transaction` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `advance_payment_method_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `advance_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance`
--


--
-- Table structure for table `advance_approval`
--

DROP TABLE IF EXISTS `advance_approval`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_approval` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) NOT NULL,
  `normal_advance_approved` tinyint(1) NOT NULL DEFAULT '0',
  `micro_advance_approved` tinyint(1) NOT NULL DEFAULT '0',
  `approved` tinyint(1) NOT NULL,
  `approved_amounts` json DEFAULT NULL,
  `primary_rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejection_reasons` json DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_preferred` tinyint(1) NOT NULL DEFAULT '0',
  `grouped_at` timestamp NULL DEFAULT NULL,
  `group_token` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expected_transaction_id` bigint(20) DEFAULT NULL,
  `recurring_transaction_id` int(11) DEFAULT NULL,
  `default_payback_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `advance_approval_bank_account_id` (`bank_account_id`),
  KEY `advance_approval_user_id` (`user_id`),
  KEY `primary_rejection_reason_idx` (`primary_rejection_reason`),
  KEY `created_idx` (`created`),
  KEY `advance_approval_expected_transaction_id_fk` (`expected_transaction_id`),
  KEY `advance_approval_recurring_transaction_id_fk` (`recurring_transaction_id`),
  CONSTRAINT `advance_approval_recurring_transaction_id_fk` FOREIGN KEY (`recurring_transaction_id`) REFERENCES `recurring_transaction` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_approval`
--


--
-- Table structure for table `advance_collection_attempt`
--

DROP TABLE IF EXISTS `advance_collection_attempt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_collection_attempt` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_id` int(11) NOT NULL,
  `trigger` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `extra` json DEFAULT NULL,
  `processing` tinyint(1) DEFAULT '1',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `advance_collection_attempt_advance_processing_unq_idx` (`advance_id`,`processing`),
  KEY `advance_collection_attempt_advance_payment_id` (`payment_id`),
  KEY `advance_collection_attempt_trigger` (`trigger`),
  CONSTRAINT `advance_attempt_advance_id_fk` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_collection_attempt`
--


--
-- Table structure for table `advance_collection_schedule`
--

DROP TABLE IF EXISTS `advance_collection_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_collection_schedule` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_id` int(11) NOT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `window_start` date DEFAULT NULL,
  `window_end` date DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `advance_id_idx` (`advance_id`),
  KEY `payment_id_idx` (`payment_id`),
  KEY `created_idx` (`created`),
  KEY `window_idx` (`window_start`,`window_end`),
  CONSTRAINT `collection_schedule_advance_id_fk` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `collection_schedule_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payment` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_collection_schedule`
--


--
-- Table structure for table `advance_experiment`
--

DROP TABLE IF EXISTS `advance_experiment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_experiment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int(11) NOT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_experiment`
--

INSERT INTO `advance_experiment` VALUES (1,'Account Age Experiment',2,NULL,NULL,NULL,'Machine learning node. Runs for users who have < 60 days of transaction data. Gives $20 to users with no recurring paychecks and $50 to users with a recurring paycheck setup.','2019-12-30 20:57:35','2019-12-30 20:57:35'),(2,'Payday Solvency Forgiveness',2,NULL,NULL,NULL,'Machine Learning node. Runs for users who had < $105 dollars in their account for any of the 2 days following their last paycheck. advances $75 to those whose pass.','2019-12-30 20:57:35','2019-12-30 20:57:35'),(3,'Variable Tiny Money Override',2,NULL,NULL,NULL,'Machine learning node. Runs in conjunction with tiny money rules and advances $20 to any user who passed ML and would have received less than that with the static rules.','2019-12-30 20:57:35','2019-12-30 20:57:35'),(4,'14 Days Until Next Paycheck Experiment',1,'2019-12-30 00:00:00',NULL,NULL,'Increases the max days until next paycheck from 11 to 14 days.','2019-12-30 20:57:35','2019-12-30 20:57:35'),(5,'Low Income Failure Experiment',1,'2019-12-30 00:00:00',NULL,NULL,'Runs for any user who failed income validation due to having an income amount \n                below $200. This node runs the Solvency failure ML model on those users and is \n                limited to 10000 users','2019-12-30 20:57:36','2019-12-30 20:57:36'),(6,'One Hundred Dollar Experiment',1,'2019-12-30 20:57:37',NULL,NULL,'Node to randomly approve some people for $100','2019-12-30 20:57:37','2019-12-30 20:57:37'),(7,'Low Income ML Model V2',2,'2019-12-30 20:57:37',NULL,NULL,'Machine learning node. Runs for users whose last income was < $200 if they pass ML, uses the generalized failure model','2019-12-30 20:57:37','2019-12-30 20:57:37'),(8,'Generalized Failure Model',1,'2019-12-30 20:57:37',NULL,NULL,'Machine Learning node. Runs for users who have failed solvency will eventually run for users who fail low income as well','2019-12-30 20:57:37','2019-12-30 20:57:37');

--
-- Table structure for table `advance_experiment_log`
--

DROP TABLE IF EXISTS `advance_experiment_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_experiment_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) NOT NULL,
  `advance_id` int(11) DEFAULT NULL,
  `advance_approval_id` int(11) DEFAULT NULL,
  `success` tinyint(1) DEFAULT NULL,
  `advance_experiment_id` int(11) DEFAULT NULL,
  `experiment_value` decimal(15,10) DEFAULT NULL,
  `is_ml` tinyint(1) DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `advance_experiment_log_experiment_id_fk` (`advance_experiment_id`),
  KEY `advance_experiment_log_approval_id_fk` (`advance_approval_id`),
  KEY `advance_experiment_log_advance_id_fk` (`advance_id`),
  KEY `advance_experiment_log_bank_account_id_fk` (`bank_account_id`),
  KEY `advance_experiment_log_user_id_fk` (`user_id`),
  CONSTRAINT `advance_experiment_log_advance_id_fk` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `advance_experiment_log_approval_id_fk` FOREIGN KEY (`advance_approval_id`) REFERENCES `advance_approval` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `advance_experiment_log_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `advance_experiment_log_experiment_id_fk` FOREIGN KEY (`advance_experiment_id`) REFERENCES `advance_experiment` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `advance_experiment_log_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_experiment_log`
--


--
-- Table structure for table `advance_node_log`
--

DROP TABLE IF EXISTS `advance_node_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_node_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_approval_id` int(11) DEFAULT NULL,
  `success` tinyint(1) DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approval_response` json DEFAULT NULL,
  `success_node_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_node_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `advance_node_log_approval_id_fk` (`advance_approval_id`),
  KEY `advance_node_log_name_idx` (`name`),
  KEY `advance_node_log_success_node_success_idx` (`success_node_name`,`success`),
  KEY `advance_node_log_failure_node_success_idx` (`failure_node_name`,`success`),
  CONSTRAINT `advance_node_log_approval_id_fk` FOREIGN KEY (`advance_approval_id`) REFERENCES `advance_approval` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_node_log`
--


--
-- Table structure for table `advance_payback_date_prediction`
--

DROP TABLE IF EXISTS `advance_payback_date_prediction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_payback_date_prediction` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `advance_approval_id` int(11) NOT NULL,
  `predicted_date` date NOT NULL,
  `score` decimal(13,10) NOT NULL,
  `success` tinyint(1) NOT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `advance_payback_predicted_date_prediction_unique_idx` (`advance_approval_id`,`predicted_date`),
  CONSTRAINT `advance_payback_date_prediction_advance_approval_id_fk` FOREIGN KEY (`advance_approval_id`) REFERENCES `advance_approval` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_payback_date_prediction`
--


--
-- Table structure for table `advance_rule_log`
--

DROP TABLE IF EXISTS `advance_rule_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_rule_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_approval_id` int(11) DEFAULT NULL,
  `success` tinyint(1) DEFAULT NULL,
  `node_name` varchar(255) DEFAULT NULL,
  `rule_name` varchar(255) DEFAULT NULL,
  `data` json DEFAULT NULL,
  `error` varchar(255) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `advance_rule_log_approval_id_fk` (`advance_approval_id`),
  KEY `advance_rule_log_node_name_idx` (`node_name`),
  KEY `advance_rule_log_rule_name_idx` (`rule_name`),
  KEY `advance_rule_log_error_idx` (`error`),
  CONSTRAINT `advance_rule_log_approval_id_fk` FOREIGN KEY (`advance_approval_id`) REFERENCES `advance_approval` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_rule_log`
--


--
-- Table structure for table `advance_tip`
--

DROP TABLE IF EXISTS `advance_tip`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advance_tip` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `amount` decimal(16,2) NOT NULL DEFAULT '0.00',
  `percent` int(11) NOT NULL DEFAULT '0',
  `advance_id` int(11) NOT NULL,
  `donation_organization_id` bigint(20) unsigned DEFAULT NULL,
  `modifications` json DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `advance_tip_advance_id_fk` (`advance_id`),
  KEY `advance_tip_donation_organization_id_fk` (`donation_organization_id`),
  CONSTRAINT `advance_tip_advance_id_fk` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`),
  CONSTRAINT `advance_tip_donation_organization_id_fk` FOREIGN KEY (`donation_organization_id`) REFERENCES `donation_organization` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advance_tip`
--


--
-- Table structure for table `alert`
--

DROP TABLE IF EXISTS `alert`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('SMS','EMAIL','PUSH') COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtype` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int(11) NOT NULL,
  `event_uuid` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `event_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alert_user_id` (`user_id`),
  KEY `alert_subtype_idx` (`subtype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert`
--


--
-- Table structure for table `app_store_review`
--

DROP TABLE IF EXISTS `app_store_review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_store_review` (
  `id` int(11) NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `published_date` date NOT NULL,
  `rating` int(11) NOT NULL,
  `platform` enum('ANDROID','IOS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `author` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rating_idx` (`rating`),
  KEY `platform_idx` (`platform`),
  KEY `published_date_idx` (`published_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_store_review`
--


--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `successful` tinyint(1) DEFAULT NULL,
  `event_uuid` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `event_type` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `audit_log_user_id` (`user_id`),
  KEY `audit_log_type_idx` (`type`),
  KEY `audit_log_event_uuid_idx` (`event_uuid`),
  KEY `audit_log_event_uuid_type_idx` (`event_uuid`,`type`),
  KEY `audit_log_user_id_type_idx` (`user_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--


--
-- Table structure for table `bank_account`
--

DROP TABLE IF EXISTS `bank_account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_account` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_connection_id` int(11) NOT NULL,
  `institution_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `account_number` varchar(265) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(256) CHARACTER SET latin1 COLLATE latin1_bin DEFAULT NULL,
  `synapse_node_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_four` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current` decimal(16,2) DEFAULT NULL,
  `available` decimal(16,2) DEFAULT NULL,
  `type` enum('LOAN','DEPOSITORY','CREDIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtype` enum('CHECKING','PREPAID','PREPAID_DEBIT','CD','CREDIT','CREDIT CARD','LINE OF CREDIT','MONEY MARKET','SAVINGS','OVERDRAFT','MORTGAGE','STUDENT','LOAN','CONSUMER','AUTO','OTHER','REWARDS','HOME EQUITY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `account_number_aes256` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pre_approval_waitlist` datetime DEFAULT NULL,
  `risepay_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_paycheck_recurring_transaction_id` int(11) DEFAULT NULL,
  `micro_deposit` enum('NOT_REQUIRED','REQUIRED','FAILED','COMPLETED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `micro_deposit_created` datetime DEFAULT NULL,
  `default_payment_method_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_id` (`external_id`),
  UNIQUE KEY `synapse_node_id` (`synapse_node_id`),
  UNIQUE KEY `risepay_id` (`risepay_id`),
  KEY `bank_account_user_id_fk` (`user_id`),
  KEY `bank_account_institution_id_fk` (`institution_id`),
  KEY `bank_account_bank_connection_id_fk` (`bank_connection_id`),
  KEY `bank_account_account_number` (`account_number`),
  KEY `bank_account_main_paycheck_recurring_transaction_id_fk` (`main_paycheck_recurring_transaction_id`),
  KEY `micro_deposit_idx` (`micro_deposit`),
  CONSTRAINT `bank_account_bank_connection_id_fk` FOREIGN KEY (`bank_connection_id`) REFERENCES `bank_connection` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `bank_account_institution_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institution` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `bank_account_main_paycheck_recurring_transaction_id_fk` FOREIGN KEY (`main_paycheck_recurring_transaction_id`) REFERENCES `recurring_transaction` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_account`
--


--
-- Table structure for table `bank_connection`
--

DROP TABLE IF EXISTS `bank_connection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_connection` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `institution_id` int(11) DEFAULT NULL,
  `external_id` varchar(256) CHARACTER SET latin1 COLLATE latin1_bin DEFAULT NULL,
  `auth_token` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `has_valid_credentials` tinyint(1) NOT NULL DEFAULT '1',
  `has_transactions` tinyint(1) NOT NULL DEFAULT '0',
  `initial_pull` datetime DEFAULT NULL,
  `historical_pull` datetime DEFAULT NULL,
  `last_pull` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `banking_data_source_error_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banking_data_source_error_at` datetime DEFAULT NULL,
  `banking_data_source` enum('PLAID','BANK_OF_DAVE','MX') COLLATE utf8mb4_unicode_ci DEFAULT 'PLAID',
  `primary_bank_account_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_token` (`auth_token`),
  UNIQUE KEY `external_id` (`external_id`),
  KEY `bank_connection_user_id_fk` (`user_id`),
  KEY `bank_connection_banking_data_source_idx` (`banking_data_source`),
  KEY `bank_connection_primary_bank_account_id_fk` (`primary_bank_account_id`),
  CONSTRAINT `bank_connection_primary_bank_account_id_fk` FOREIGN KEY (`primary_bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `bank_connection_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_connection`
--


--
-- Table structure for table `bank_connection_transition`
--

DROP TABLE IF EXISTS `bank_connection_transition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_connection_transition` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `from_bank_connection_id` int(11) NOT NULL,
  `to_bank_connection_id` int(11) NOT NULL,
  `from_default_bank_account_id` int(11) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `has_received_first_paycheck` tinyint(1) NOT NULL DEFAULT '0',
  `has_activated_physical_card` tinyint(1) NOT NULL DEFAULT '0',
  `has_received_recurring_paycheck` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bank_connection_transition_from_to_bank_connection_id_uix` (`from_bank_connection_id`,`to_bank_connection_id`),
  KEY `bank_connection_transition_from_default_bank_account_id_fk` (`from_default_bank_account_id`),
  KEY `bank_connection_transition_to_bank_connection_id_fk` (`to_bank_connection_id`),
  CONSTRAINT `bank_connection_transition_from_bank_connection_id_fk` FOREIGN KEY (`from_bank_connection_id`) REFERENCES `bank_connection` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `bank_connection_transition_from_default_bank_account_id_fk` FOREIGN KEY (`from_default_bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `bank_connection_transition_to_bank_connection_id_fk` FOREIGN KEY (`to_bank_connection_id`) REFERENCES `bank_connection` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_connection_transition`
--


--
-- Table structure for table `bank_connection_update`
--

DROP TABLE IF EXISTS `bank_connection_update`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_connection_update` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_connection_id` int(11) NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id_idx` (`user_id`),
  KEY `bank_connection_update_created` (`created`),
  KEY `bank_connection_update_type` (`type`),
  KEY `bank_connection_update_bank_connection_id` (`bank_connection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_connection_update`
--


--
-- Table structure for table `bank_transaction`
--

DROP TABLE IF EXISTS `bank_transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_transaction` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `bank_account_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `external_id` varchar(256) CHARACTER SET latin1 COLLATE latin1_bin DEFAULT NULL,
  `account_type` enum('LOAN','DEPOSITORY','CREDIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_subtype` enum('CHECKING','PREPAID','PREPAID_DEBIT','CD','CREDIT','CREDIT CARD','LINE OF CREDIT','MONEY MARKET','SAVINGS','OVERDRAFT','MORTGAGE','STUDENT','LOAN','CONSUMER','AUTO','OTHER','REWARDS','HOME EQUITY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pending_external_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pending_display_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `transaction_date` date NOT NULL,
  `pending` tinyint(1) NOT NULL,
  `address` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zip_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `plaid_category` json DEFAULT NULL,
  `plaid_category_id` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_number` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ppd_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payee_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `merchant_info_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_id` (`external_id`),
  UNIQUE KEY `bank_transaction_external_id_bank_account_id_idx` (`bank_account_id`,`external_id`),
  KEY `bank_transaction_bank_account_idx` (`bank_account_id`),
  KEY `bank_transaction_display_name` (`display_name`),
  KEY `bank_transaction_pending_display_name` (`pending_display_name`),
  KEY `bank_transaction_transaction_date` (`transaction_date`),
  KEY `bank_transaction_bank_account_id_transaction_date_idx` (`bank_account_id`,`transaction_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_transaction`
--


--
-- Table structure for table `bank_transactions_tokens`
--

DROP TABLE IF EXISTS `bank_transactions_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_transactions_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token_string` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `merchant_info_id` int(11) DEFAULT NULL,
  `category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bank_transactions_tokens_token_string_idx` (`token_string`),
  KEY `bank_transactions_tokens_category_idx` (`category`),
  KEY `bank_transactions_tokens_category_token_string_idx` (`category`,`token_string`)
) ENGINE=InnoDB AUTO_INCREMENT=549 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_transactions_tokens`
--

INSERT INTO `bank_transactions_tokens` VALUES (1,'zumiez',19039,'Shops','Clothing and Accessories'),(2,'ace cash express',4403,'Bank Fees','Insufficient Funds'),(3,'ace cash express',4403,'Bank Fees','Overdraft'),(4,'ace cash express',4403,'Service','Financial'),(5,'ach capital one',6609,'Payment','Credit Card'),(6,'acme',4495,'Shops','Supermarkets and Groceries'),(7,'acorns investingtransfer',4500,'Transfer','Third Party'),(8,'advance america',4565,'Bank Fees','Overdraft'),(9,'advance america',4565,'Bank Fees','Insufficient Funds'),(10,'advance america',4565,'Service','Financial'),(11,'airbnb',4625,'Travel','Lodging'),(12,'albertson',4672,'Shops','Supermarkets and Groceries'),(13,'albertson',4672,'Shops','Food and Beverage Store'),(14,'albertsons',4672,'Shops','Supermarkets and Groceries'),(15,'aldi',4675,'Shops','Supermarkets and Groceries'),(16,'aliexpress',4699,'Transfer','Withdrawal'),(17,'aliexpress ca',4699,'Transfer','Withdrawal'),(18,'allstate',4725,'Shops','Glasses and Optometrist'),(19,'allstate',4725,'Shops','Bookstores'),(20,'allstate',4725,'Shops','Clothing and Accessories'),(21,'allstate',4725,'Shops','Furniture and Home Decor'),(22,'amazon',4778,'Shops','Automotive'),(23,'amazon',4778,'Shops','Dance and Music'),(24,'amazon',4778,'Shops','Office Supplies'),(25,'amazon',4778,'Shops','Beauty Products'),(26,'amazon',4778,'Shops','Supermarkets and Groceries'),(27,'amazon',4778,'Shops','Digital Purchase'),(28,'american airlines',4801,'Food and Drink','Restaurants'),(29,'american airlines',4801,'Travel','Airlines and Aviation Services'),(30,'american express',4806,'Payment','Credit Card'),(31,'american express ach',4806,'Payment','Credit Card'),(32,'american express des',4806,'Payment','Credit Card'),(33,'american express ser',4806,'Payment','Credit Card'),(34,'american express serve',4806,'Payment','Credit Card'),(35,'apple pay cash',4983,'Service','Financial'),(36,'apple pay sent',4984,'Shops','Computers and Electronics'),(37,'applebee',4987,'Service','Food and Beverage'),(38,'applebee',4987,'Food and Drink','Restaurants'),(39,'aramark',5008,'Service','Business Services'),(40,'aramark',5008,'Food and Drink','Restaurants'),(41,'arbys',5013,'Food and Drink','Restaurants'),(42,'arco',5018,'Shops','Food and Beverage Store'),(43,'arco',5018,'Shops','Convenience Stores'),(44,'arco',5018,'Travel','Gas Stations'),(45,'audible',5366,'Shops','Bookstores'),(46,'auntie anne',5376,'Shops','Food and Beverage Store'),(47,'auntie anne',5376,'Food and Drink','Restaurants'),(48,'auntie annes',5376,'Shops','Food and Beverage Store'),(49,'auntie annes',5376,'Food and Drink','Restaurants'),(50,'autozone',5491,'Service','Automotive'),(51,'autozone',5491,'Shops','Automotive'),(52,'bank of america',5662,'Transfer','Deposit'),(53,'bank of america',5662,'Payment','Credit Card'),(54,'bank of america',5662,'Bank Fees','ATM'),(55,'bank of america',5662,'Transfer','Withdrawal'),(56,'bank of america',5662,'Service','Financial'),(57,'barnes noble',5726,'Shops','Bookstores'),(58,'barnesnoble',5726,'Shops','Newsstands'),(59,'barnesnoble',5726,'Shops','Bookstores'),(60,'bath body works',5761,'Shops','Beauty Products'),(61,'best buy',5925,'Shops','Computers and Electronics'),(62,'big lots',5958,'Shops','Clothing and Accessories'),(63,'big lots',5958,'Shops','Discount Stores'),(64,'big lots',5958,'Shops','Furniture and Home Decor'),(65,'bkofamerica',6030,'Bank Fees','ATM'),(66,'bkofamerica',6030,'Transfer','Withdrawal'),(67,'bkofamerica',6030,'Transfer','Debit'),(68,'bkofamerica atm',6030,'Service','Financial'),(69,'bkofamerica atm',6030,'Bank Fees','ATM'),(70,'bkofamerica atm',6030,'Transfer','Withdrawal'),(71,'boost mobile',6146,'Service','Telecommunication Services'),(72,'boston market',6157,'Service','Food and Beverage'),(73,'boston market',6157,'Food and Drink','Restaurants'),(74,'buffalo wild wings',6357,'Food and Drink','Restaurants'),(75,'buffalo wings',6357,'Food and Drink','Bar'),(76,'buffalo wings',6357,'Food and Drink','Restaurants'),(77,'burger kin',6380,'Service','Food and Beverage'),(78,'burger kin',6380,'Food and Drink','Restaurants'),(79,'burger king',6380,'Service','Food and Beverage'),(80,'burger king',6380,'Food and Drink','Restaurants'),(81,'capital one',6609,'Payment','Credit Card'),(82,'capital one',6609,'Service','Financial'),(83,'capital one auto',6609,'Service','Financial'),(84,'capital one bank',6609,'Service','Financial'),(85,'capital one bnk',6609,'Transfer','Debit'),(86,'capital one card',6609,'Transfer','Debit'),(87,'capital one des',6609,'Service','Financial'),(88,'capital one des',6609,'Payment','Credit Card'),(89,'capital one type',6609,'Transfer','Debit'),(90,'capital one type',6609,'Payment','Credit Card'),(91,'capitalone',6609,'Transfer','Debit'),(92,'cardtronics',6897,'Bank Fees','Overdraft'),(93,'cardtronics',6897,'Bank Fees','Insufficient Funds'),(94,'cardtronics',6897,'Bank Fees','ATM'),(95,'cardtronics',6897,'Transfer','Withdrawal'),(96,'cardtronics',6897,'Service','Financial'),(97,'carter',13205,'Shops','Clothing and Accessories'),(98,'carters',13205,'Shops','Clothing and Accessories'),(99,'caseys gen store',20667,'Food and Drink','Restaurants'),(100,'caseys gen store',20667,'Travel','Gas Stations'),(101,'cash express',4403,'Service','Financial'),(102,'cents only store',19748,'Shops','Discount Stores'),(103,'centurylink',19349,'Service','Telecommunication Services'),(104,'charlotte russ',10751,'Shops','Clothing and Accessories'),(105,'charlotte russe',10751,'Shops','Clothing and Accessories'),(106,'chase',21527,'Service','Financial'),(107,'checkers',21076,'Shops','Food and Beverage Store'),(108,'checkers and rally',20192,'Food and Drink','Restaurants'),(109,'chevron',21525,'Shops','Convenience Stores'),(110,'chevron',21525,'Shops','Tobacco'),(111,'chevron',21525,'Travel','Gas Stations'),(112,'chick fil',21491,'Food and Drink','Restaurants'),(113,'chipotle',5130,'Shops','Food and Beverage Store'),(114,'chipotle',5130,'Food and Drink','Restaurants'),(115,'chipotle mexican grill',21010,'Food and Drink','Restaurants'),(116,'church chicken',13653,'Food and Drink','Restaurants'),(117,'churchs chicken',13653,'Food and Drink','Restaurants'),(118,'cinemark theatres',20796,'Food and Drink','Restaurants'),(119,'cinemark theatres',20796,'Recreation','Arts and Entertainment'),(120,'cinnabon',19205,'Service','Food and Beverage'),(121,'cinnabon',19205,'Food and Drink','Restaurants'),(122,'citgo',21394,'Shops','Food and Beverage Store'),(123,'citgo',21394,'Shops','Tobacco'),(124,'citgo',21394,'Shops','Supermarkets and Groceries'),(125,'citgo',21394,'Travel','Gas Stations'),(126,'coinbase',21103,'Transfer','Third Party'),(127,'cold stone creamery',19329,'Shops','Food and Beverage Store'),(128,'cold stone creamery',19329,'Food and Drink','Restaurants'),(129,'comcast',21284,'Service','Subscription'),(130,'comcast',21284,'Service','Internet Services'),(131,'comcast',21284,'Service','Telecommunication Services'),(132,'comcast',21284,'Service','Cable'),(133,'conoco',20901,'Travel','Gas Stations'),(134,'cook out',21074,'Food and Drink','Restaurants'),(135,'costco',21266,'Shops','Warehouses and Wholesale Stores'),(136,'costco gas',20528,'Travel','Gas Stations'),(137,'cracker barrel',20161,'Food and Drink','Restaurants'),(138,'cricket wireless',20840,'Service','Telecommunication Services'),(139,'cumberland far',18246,'Shops','Convenience Stores'),(140,'cumberland far',18246,'Shops','Supermarkets and Groceries'),(141,'cumberland farm',18246,'Shops','Convenience Stores'),(142,'cumberland farm',18246,'Shops','Supermarkets and Groceries'),(143,'cumberland farm',18246,'Travel','Gas Stations'),(144,'cumberland farms',18246,'Shops','Convenience Stores'),(145,'cumberland farms',18246,'Travel','Gas Stations'),(146,'cvs pharmacy',6667,'Shops','Pharmacies'),(147,'dairy queen',21287,'Food and Drink','Restaurants'),(148,'dennys',8407,'Food and Drink','Restaurants'),(149,'discover payment',9728,'Payment','Credit Card'),(150,'dish network',19293,'Service','Cable'),(151,'dnkn donuts',21214,'Food and Drink','Restaurants'),(152,'dollar ge',13929,'Shops','Discount Stores'),(153,'dollar gener',13929,'Shops','Discount Stores'),(154,'duane reade',20392,'Shops','Pharmacies'),(155,'earnin',21540,'Service','Financial'),(156,'ebay',19519,'Shops','Digital Purchase'),(157,'el pollo loco',20026,'Service','Food and Beverage'),(158,'el pollo loco',20026,'Food and Drink','Restaurants'),(159,'7-eleven',21564,'Shops','Food and Beverage Store'),(160,'7-eleven',21564,'Service','Food and Beverage'),(161,'7-eleven',21564,'Shops','Convenience Stores'),(162,'enterprise rent',20397,'Travel','Car and Truck Rentals'),(163,'etsy',20719,'Transfer','Third Party'),(164,'exxonmobil',21417,'Travel','Gas Stations'),(165,'family dolla',18336,'Shops','Discount Stores'),(166,'family dollar',18336,'Shops','Discount Stores'),(167,'fandango',20578,'Recreation','Arts and Entertainment'),(168,'fedex',20745,'Service','Shipping and Freight'),(169,'firehouse',20444,'Service','Food and Beverage'),(170,'firehouse',20444,'Food and Drink','Restaurants'),(171,'firehouse subs',20285,'Service','Food and Beverage'),(172,'firehouse subs',20285,'Food and Drink','Restaurants'),(173,'five below',21063,'Shops','Discount Stores'),(174,'five guys',20080,'Service','Food and Beverage'),(175,'five guys',20080,'Food and Drink','Restaurants'),(176,'food lion',21361,'Shops','Supermarkets and Groceries'),(177,'forever',20930,'Shops','Clothing and Accessories'),(178,'fred meyer',17732,'Shops','Supermarkets and Groceries'),(179,'frys food',18046,'Shops','Supermarkets and Groceries'),(180,'frys food dr',18046,'Shops','Supermarkets and Groceries'),(181,'frys food drg',18046,'Shops','Supermarkets and Groceries'),(182,'gamestop',21137,'Recreation','Arts and Entertainment'),(183,'gamestop',21137,'Shops','Computers and Electronics'),(184,'geico',21302,'Service','Insurance'),(185,'giant',21308,'Shops','Tobacco'),(186,'giant',21308,'Shops','Food and Beverage Store'),(187,'giant',21308,'Shops','Supermarkets and Groceries'),(188,'giant eagle',20570,'Shops','Supermarkets and Groceries'),(189,'giant eagle',20570,'Shops','Pharmacies'),(190,'golden corral',20512,'Shops','Food and Beverage Store'),(191,'golden corral',20512,'Food and Drink','Restaurants'),(192,'goodwill',21001,'Shops','Bookstores'),(193,'goodwill',21001,'Community','Organizations and Associations'),(194,'goodwill',21001,'Shops','Vintage and Thrift'),(195,'google',21447,'Service','Advertising and Marketing'),(196,'google',21447,'Service','Subscription'),(197,'google',21447,'Shops','Digital Purchase'),(198,'google music',19968,'Shops','Digital Purchase'),(199,'google music',19968,'Service','Subscription'),(200,'google play',21245,'Shops','Digital Purchase'),(201,'google play',21245,'Service','Subscription'),(202,'great clips',20212,'Service','Personal Care'),(203,'groupon',21229,'Recreation','Gyms and Fitness Centers'),(204,'groupon',21229,'Food and Drink','Restaurants'),(205,'groupon',21229,'Shops','Digital Purchase'),(206,'grubhub',21319,'Shops','Supermarkets and Groceries'),(207,'grubhub',21319,'Food and Drink','Restaurants'),(208,'gulf oil',20494,'Service','Automotive'),(209,'gulf oil',20494,'Travel','Gas Stations'),(210,'harris teeter supermarkets',20498,'Food and Drink','Restaurants'),(211,'harris teeter supermarkets',20498,'Shops','Supermarkets and Groceries'),(212,'holiday station',16997,'Food and Drink','Restaurants'),(213,'holiday station',16997,'Shops','Food and Beverage Store'),(214,'holiday station',16997,'Shops','Convenience Stores'),(215,'holiday station',16997,'Travel','Gas Stations'),(216,'holiday station store',16997,'Food and Drink','Restaurants'),(217,'holiday station store',16997,'Shops','Food and Beverage Store'),(218,'holiday station store',16997,'Shops','Convenience Stores'),(219,'holiday station store',16997,'Travel','Gas Stations'),(220,'holiday stationstore',16997,'Food and Drink','Restaurants'),(221,'holiday stationstore',16997,'Travel','Gas Stations'),(222,'home depot',21325,'Shops','Construction Supplies'),(223,'home depot',21325,'Shops','Hardware Store'),(224,'hot topic',19207,'Shops','Clothing and Accessories'),(225,'hulu llc',16202,'Service','Subscription'),(226,'ihop',21156,'Shops','Food and Beverage Store'),(227,'ihop',21156,'Service','Food and Beverage'),(228,'ihop',21156,'Food and Drink','Restaurants'),(229,'ikea',20057,'Food and Drink','Restaurants'),(230,'ikea',20057,'Shops','Furniture and Home Decor'),(231,'jack in the',21409,'Service','Food and Beverage'),(232,'jack in the',21409,'Shops','Food and Beverage Store'),(233,'jack in the',21409,'Food and Drink','Restaurants'),(234,'jamba juice',20233,'Shops','Food and Beverage Store'),(235,'jamba juice',20233,'Food and Drink','Restaurants'),(236,'jcpenney',20921,'Shops','Department Stores'),(237,'jersey mikes',9071,'Food and Drink','Restaurants'),(238,'jersey mikes subs',9071,'Food and Drink','Restaurants'),(239,'jiffy lube',18644,'Service','Automotive'),(240,'jimmy john',17593,'Food and Drink','Restaurants'),(241,'jimmy johns',17593,'Food and Drink','Restaurants'),(242,'jpay',20470,'Transfer','Third Party'),(243,'king soopers',9630,'Shops','Supermarkets and Groceries'),(244,'kmart',20619,'Shops','Clothing and Accessories'),(245,'kmart',20619,'Shops','Arts and Crafts'),(246,'kmart',20619,'Shops','Discount Stores'),(247,'kmart',20619,'Shops','Supermarkets and Groceries'),(248,'kmart',20619,'Shops','Food and Beverage Store'),(249,'kmart',20619,'Shops','Department Stores'),(250,'kohls',20424,'Shops','Department Stores'),(251,'krispy kreme',20563,'Shops','Food and Beverage Store'),(252,'krispy kreme',20563,'Service','Food and Beverage'),(253,'krispy kreme',20563,'Food and Drink','Restaurants'),(254,'kwik trip',21040,'Shops','Tobacco'),(255,'kwik trip',21040,'Food and Drink','Restaurants'),(256,'kwik trip',21040,'Shops','Supermarkets and Groceries'),(257,'kwik trip',21040,'Travel','Gas Stations'),(258,'la fitness',20027,'Recreation','Gyms and Fitness Centers'),(259,'lendup',20409,'Service','Financial'),(260,'lendup lenduploan',20409,'Service','Financial'),(261,'lowes',20557,'Shops','Food and Beverage Store'),(262,'lowes',20557,'Shops','Supermarkets and Groceries'),(263,'lowes',20557,'Shops','Hardware Store'),(264,'lyft',21567,'Travel','Car Service'),(265,'macys',20201,'Food and Drink','Restaurants'),(266,'macys',20201,'Service','Food and Beverage'),(267,'macys',20201,'Shops','Department Stores'),(268,'marathon',5166,'Shops','Tobacco'),(269,'marathon',5166,'Shops','Food and Beverage Store'),(270,'marathon',5166,'Shops','Convenience Stores'),(271,'marathon',5166,'Shops','Supermarkets and Groceries'),(272,'marathon',5166,'Shops','Discount Stores'),(273,'marshall',19585,'Shops','Furniture and Home Decor'),(274,'marshall',19585,'Shops','Marine Supplies'),(275,'marshall',19585,'Shops','Pets'),(276,'marshall',19585,'Shops','Department Stores'),(277,'marshall',19585,'Shops','Clothing and Accessories'),(278,'marshall',19585,'Shops','Bookstores'),(279,'marshall',19585,'Shops','Gift and Novelty'),(280,'marshall',19585,'Shops','Supermarkets and Groceries'),(281,'marshall',19585,'Shops','Food and Beverage Store'),(282,'marshall',19585,'Shops','Hardware Store'),(283,'marshalls',19585,'Shops','Furniture and Home Decor'),(284,'marshalls',19585,'Shops','Supermarkets and Groceries'),(285,'marshalls',19585,'Shops','Department Stores'),(286,'mcalister',8491,'Food and Drink','Restaurants'),(287,'mcalisters',8491,'Food and Drink','Restaurants'),(288,'mcdonald',18592,'Service','Food and Beverage'),(289,'mcdonald',18592,'Food and Drink','Restaurants'),(290,'meijer',21304,'Shops','Tobacco'),(291,'meijer',21304,'Food and Drink','Restaurants'),(292,'meijer',21304,'Shops','Supermarkets and Groceries'),(293,'metro pcs',17772,'Service','Telecommunication Services'),(294,'metropcs',17772,'Service','Telecommunication Services'),(295,'metropolitan transportation',21113,'Travel','Public Transportation Services'),(296,'metropolitan transportation authority',21113,'Travel','Public Transportation Services'),(297,'michael',20725,'Shops','Arts and Crafts'),(298,'michael',20725,'Shops','Antiques'),(299,'michael',20725,'Shops','Florists'),(300,'michael',20725,'Shops','Furniture and Home Decor'),(301,'michael',20725,'Shops','Discount Stores'),(302,'michael',20725,'Shops','Jewelry and Watches'),(303,'michael',20725,'Shops','Clothing and Accessories'),(304,'michaels',20725,'Shops','Clothing and Accessories'),(305,'michaels',20725,'Shops','Jewelry and Watches'),(306,'michaels',20725,'Shops','Furniture and Home Decor'),(307,'michaels',20725,'Shops','Arts and Crafts'),(308,'microsoft xb',17373,'Shops','Computers and Electronics'),(309,'microsoft xb',17373,'Shops','Digital Purchase'),(310,'microsoft xbo',17373,'Shops','Computers and Electronics'),(311,'microsoft xbox',17373,'Shops','Computers and Electronics'),(312,'moviepass',20294,'Recreation','Arts and Entertainment'),(313,'moviepass',20294,'Transfer','Withdrawal'),(314,'moviepass',20294,'Shops','Food and Beverage Store'),(315,'moviepass inc',20294,'Transfer','Withdrawal'),(316,'moviepass inc',20294,'Shops','Food and Beverage Store'),(317,'navy exchange',20579,'Community','Government Departments and Agencies'),(318,'netflix',21479,'Service','Subscription'),(319,'nike',20405,'Shops','Sporting Goods'),(320,'nike',20405,'Shops','Clothing and Accessories'),(321,'nordstrom',20592,'Shops','Department Stores'),(322,'office depot',19542,'Shops','Office Supplies'),(323,'old navy',20946,'Shops','Clothing and Accessories'),(324,'olive garden',20844,'Food and Drink','Restaurants'),(325,'oreilly auto',21115,'Shops','Automotive'),(326,'panda express',21300,'Food and Drink','Restaurants'),(327,'panera bread',21288,'Service','Food and Beverage'),(328,'panera bread',21288,'Food and Drink','Restaurants'),(329,'papa johns',18847,'Food and Drink','Restaurants'),(330,'party cit',7360,'Shops','Pets'),(331,'party cit',7360,'Shops','Food and Beverage Store'),(332,'party city',7360,'Shops','Pets'),(333,'party city',7360,'Shops','Food and Beverage Store'),(334,'party city',7360,'Shops','Gift and Novelty'),(335,'payless',20326,'Shops','Clothing and Accessories'),(336,'paypal',21557,'Transfer','Third Party'),(337,'pepsico',21246,'Service','Manufacturing'),(338,'pepsico',21246,'Food and Drink','Restaurants'),(339,'petco',20734,'Shops','Pets'),(340,'petrole',15027,'Shops','Convenience Stores'),(341,'petrole',15027,'Travel','Gas Stations'),(342,'petroleu',15027,'Shops','Convenience Stores'),(343,'petroleu',15027,'Travel','Gas Stations'),(344,'petroleum',15027,'Shops','Convenience Stores'),(345,'petroleum',15027,'Travel','Gas Stations'),(346,'petsmart',21079,'Shops','Pets'),(347,'piggly wiggly',20184,'Food and Drink','Restaurants'),(348,'piggly wiggly',20184,'Shops','Supermarkets and Groceries'),(349,'pilot travel',20650,'Travel','Gas Stations'),(350,'pilot travel center',20651,'Travel','Gas Stations'),(351,'pizza hut',21368,'Service','Food and Beverage'),(352,'pizza hut',21368,'Food and Drink','Restaurants'),(353,'planet fit',20347,'Recreation','Gyms and Fitness Centers'),(354,'planet fit des',20347,'Recreation','Gyms and Fitness Centers'),(355,'planet fitnes',17737,'Recreation','Gyms and Fitness Centers'),(356,'planet fitness',17737,'Recreation','Gyms and Fitness Centers'),(357,'pollo loco',20026,'Food and Drink','Restaurants'),(358,'pollo tropical',19739,'Food and Drink','Restaurants'),(359,'poshmark',17538,'Shops','Clothing and Accessories'),(360,'poshmark ca',17538,'Shops','Clothing and Accessories'),(361,'postmates',21315,'Shops','Supermarkets and Groceries'),(362,'postmates',21315,'Shops','Food and Beverage Store'),(363,'postmates',21315,'Service','Food and Beverage'),(364,'postmates',21315,'Food and Drink','Restaurants'),(365,'public storage',19133,'Service','Storage'),(366,'qapital',18389,'Service','Financial'),(367,'qapital in',18389,'Service','Financial'),(368,'qapital inc',18389,'Service','Financial'),(369,'qapital inc in',18389,'Service','Financial'),(370,'qdoba',20354,'Service','Food and Beverage'),(371,'qdoba',20354,'Food and Drink','Restaurants'),(372,'rally',12197,'Shops','Food and Beverage Store'),(373,'rallys',12197,'Food and Drink','Restaurants'),(374,'red lobster',20187,'Service','Food and Beverage'),(375,'red lobster',20187,'Food and Drink','Restaurants'),(376,'red robin',20325,'Service','Food and Beverage'),(377,'red robin',20325,'Food and Drink','Restaurants'),(378,'redbox',21340,'Shops','Music, Video and DVD'),(379,'regal cinemas',20164,'Recreation','Arts and Entertainment'),(380,'rite aid',21350,'Shops','Supermarkets and Groceries'),(381,'rite aid',21350,'Shops','Pharmacies'),(382,'ruby tuesday',18744,'Service','Food and Beverage'),(383,'ruby tuesday',18744,'Food and Drink','Restaurants'),(384,'safeway',21391,'Shops','Pharmacies'),(385,'safeway',21391,'Food and Drink','Restaurants'),(386,'safeway',21391,'Shops','Food and Beverage Store'),(387,'safeway',21391,'Shops','Pets'),(388,'safeway',21391,'Service','Food and Beverage'),(389,'safeway',21391,'Shops','Supermarkets and Groceries'),(390,'sally beauty',20783,'Service','Personal Care'),(391,'sally beauty',20783,'Shops','Beauty Products'),(392,'sbarro',19094,'Service','Food and Beverage'),(393,'sbarro',19094,'Shops','Food and Beverage Store'),(394,'sbarro',19094,'Food and Drink','Restaurants'),(395,'sephora',20357,'Service','Personal Care'),(396,'sephora',20357,'Shops','Beauty Products'),(397,'sheetz',21370,'Shops','Tobacco'),(398,'sheetz',21370,'Food and Drink','Restaurants'),(399,'sheetz',21370,'Travel','Gas Stations'),(400,'shell',21565,'Shops','Newsstands'),(401,'shell',21565,'Shops','Convenience Stores'),(402,'shell',21565,'Food and Drink','Restaurants'),(403,'shell',21565,'Shops','Food and Beverage Store'),(404,'shell',21565,'Shops','Tobacco'),(405,'shell',21565,'Travel','Gas Stations'),(406,'six flags',20182,'Food and Drink','Restaurants'),(407,'six flags',20182,'Recreation','Arts and Entertainment'),(408,'smoothie king',20536,'Service','Food and Beverage'),(409,'smoothie king',20536,'Shops','Food and Beverage Store'),(410,'smoothie king',20536,'Food and Drink','Restaurants'),(411,'spirit airlines',19249,'Shops','Food and Beverage Store'),(412,'spirit airlines',19249,'Food and Drink','Restaurants'),(413,'spirit airlines',19249,'Travel','Airlines and Aviation Services'),(414,'sport clips',18807,'Service','Personal Care'),(415,'spotify',21354,'Service','Subscription'),(416,'sprint wireless',5194,'Service','Telecommunication Services'),(417,'staples',20612,'Shops','Office Supplies'),(418,'starbucks',21534,'Shops','Supermarkets and Groceries'),(419,'starbucks',21534,'Shops','Convenience Stores'),(420,'starbucks',21534,'Service','Food and Beverage'),(421,'starbucks',21534,'Food and Drink','Restaurants'),(422,'state farm',21039,'Service','Insurance'),(423,'subway',21490,'Shops','Supermarkets and Groceries'),(424,'subway',21490,'Service','Food and Beverage'),(425,'subway',21490,'Shops','Food and Beverage Store'),(426,'subway',21490,'Food and Drink','Restaurants'),(427,'sunoco',21478,'Shops','Food and Beverage Store'),(428,'sunoco',21478,'Food and Drink','Restaurants'),(429,'sunoco',21478,'Travel','Gas Stations'),(430,'suntrust',20589,'Bank Fees','ATM'),(431,'suntrust',20589,'Service','Financial'),(432,'taco bell',21537,'Service','Food and Beverage'),(433,'taco bell',21537,'Food and Drink','Restaurants'),(434,'taco cabana',20122,'Food and Drink','Restaurants'),(435,'target',21528,'Shops','Office Supplies'),(436,'target',21528,'Shops','Food and Beverage Store'),(437,'target',21528,'Shops','Pharmacies'),(438,'target',21528,'Shops','Food and Beverage Store'),(439,'target',21528,'Shops','Pharmacies'),(440,'target',21528,'Shops','Gift and Novelty'),(441,'target',21528,'Food and Drink','Restaurants'),(442,'target',21528,'Shops','Bookstores'),(443,'target',21528,'Shops','Digital Purchase'),(444,'target',21528,'Shops','Supermarkets and Groceries'),(445,'target',21528,'Shops','Department Stores'),(446,'texaco',20802,'Travel','Gas Stations'),(447,'texas roadhouse',20023,'Food and Drink','Restaurants'),(448,'tim hortons',20891,'Food and Drink','Restaurants'),(449,'time warner cable',16772,'Service','Cable'),(450,'trader joe',20851,'Service','Food and Beverage'),(451,'trader joe',20851,'Shops','Supermarkets and Groceries'),(452,'transfer acorns investing',4500,'Transfer','Third Party'),(453,'travel center',20651,'Service','Travel Agents and Tour Operators'),(454,'travel center',20651,'Travel','Gas Stations'),(455,'tropical smoothie',18862,'Shops','Food and Beverage Store'),(456,'tropical smoothie',18862,'Food and Drink','Restaurants'),(457,'tropical smoothie cafe',18862,'Shops','Food and Beverage Store'),(458,'tropical smoothie cafe',18862,'Food and Drink','Restaurants'),(459,'uber trip',5207,'Travel','Car Service'),(460,'ulta',20813,'Shops','Clothing and Accessories'),(461,'ulta',20813,'Shops','Department Stores'),(462,'ulta',20813,'Service','Personal Care'),(463,'ulta',20813,'Shops','Beauty Products'),(464,'usaa',21508,'Bank Fees','ATM'),(465,'usaa',21508,'Service','Financial'),(466,'usps',21295,'Service','Shipping and Freight'),(467,'venmo',21489,'Transfer','Third Party'),(468,'verizon',21219,'Service','Telecommunication Services'),(469,'victoriassecret',20436,'Shops','Clothing and Accessories'),(470,'vons',20810,'Service','Food and Beverage'),(471,'vons',20810,'Shops','Food and Beverage Store'),(472,'vons',20810,'Food and Drink','Restaurants'),(473,'vons',20810,'Shops','Supermarkets and Groceries'),(474,'waffle house',21109,'Food and Drink','Restaurants'),(475,'wal mart',21569,'Shops','Department Stores'),(476,'walgreens',21533,'Shops','Glasses and Optometrist'),(477,'walgreens',21533,'Shops','Food and Beverage Store'),(478,'walgreens',21533,'Shops','Clothing and Accessories'),(479,'walgreens',21533,'Shops','Supermarkets and Groceries'),(480,'walgreens',21533,'Shops','Convenience Stores'),(481,'walgreens',21533,'Shops','Office Supplies'),(482,'walgreens',21533,'Shops','Pharmacies'),(483,'walmart',21569,'Shops','Clothing and Accessories'),(484,'walmart',21569,'Shops','Arts and Crafts'),(485,'walmart',21569,'Shops','Automotive'),(486,'walmart',21569,'Shops','Jewelry and Watches'),(487,'walmart',21569,'Shops','Pets'),(488,'walmart',21569,'Shops','Office Supplies'),(489,'walmart',21569,'Shops','Digital Purchase'),(490,'walmart',21569,'Shops','Food and Beverage Store'),(491,'walmart',21569,'Shops','Sporting Goods'),(492,'walmart',21569,'Shops','Discount Stores'),(493,'walmart',21569,'Shops','Glasses and Optometrist'),(494,'walmart',21569,'Travel','Gas Stations'),(495,'walmart',21569,'Food and Drink','Restaurants'),(496,'walmart',21569,'Shops','Supermarkets and Groceries'),(497,'walmart',21569,'Shops','Department Stores'),(498,'warner cabl',16772,'Service','Cable'),(499,'wawa',21484,'Service','Oil and Gas'),(500,'wawa',21484,'Travel','Gas Stations'),(501,'wegmans',20534,'Food and Drink','Restaurants'),(502,'wegmans',20534,'Service','Food and Beverage'),(503,'wegmans',20534,'Shops','Supermarkets and Groceries'),(504,'weis markets',20012,'Food and Drink','Restaurants'),(505,'weis markets',20012,'Shops','Supermarkets and Groceries'),(506,'wells fargo',20420,'Bank Fees','Overdraft'),(507,'wells fargo',20420,'Bank Fees','Insufficient Funds'),(508,'wells fargo',20420,'Bank Fees','ATM'),(509,'wells fargo',20420,'Service','Financial'),(510,'wells fargo at',20420,'Service','Financial'),(511,'wells fargo atm',20420,'Service','Financial'),(512,'wells fargo ba',20420,'Bank Fees','ATM'),(513,'wells fargo ba',20420,'Transfer','Debit'),(514,'whataburger',21317,'Service','Food and Beverage'),(515,'whataburger',21317,'Food and Drink','Restaurants'),(516,'white castle',20737,'Shops','Food and Beverage Store'),(517,'white castle',20737,'Service','Food and Beverage'),(518,'white castle',20737,'Food and Drink','Restaurants'),(519,'whole foods',21228,'Food and Drink','Restaurants'),(520,'whole foods',21228,'Shops','Supermarkets and Groceries'),(521,'wienerschnitzel',19109,'Food and Drink','Restaurants'),(522,'winco foods',6877,'Shops','Food and Beverage Store'),(523,'winco foods',6877,'Shops','Supermarkets and Groceries'),(524,'wing stop',8194,'Food and Drink','Restaurants'),(525,'wingstop',8194,'Service','Food and Beverage'),(526,'wingstop',8194,'Food and Drink','Restaurants'),(527,'winn dixie',18496,'Shops','Food and Beverage Store'),(528,'winn dixie',18496,'Shops','Supermarkets and Groceries'),(529,'ymca',19473,'Recreation','Gyms and Fitness Centers'),(530,'zaxby',18355,'Food and Drink','Restaurants'),(531,'zaxbys',18355,'Food and Drink','Restaurants'),(537,'dave inc',21572,'Transfer','Credit'),(538,'dave inc',21572,'Transfer','Debit'),(539,'dave inc',21572,'Service','Financial'),(540,'dave inc',21572,'Food and Drink','Restaurants'),(541,'dave com',21572,'Service',NULL),(542,'dave com',21572,'Transfer','Debit'),(543,'co dave inc',21572,'Transfer','Debit'),(544,'co dave inc',21572,'Transfer','Withdrawal'),(545,'co dave inc',21572,'Service','Financial'),(546,'co dave inc',21572,'Transfer','Credit'),(547,'dave inc co',21572,'Transfer','Debit'),(548,'dave inc co',21572,'Transfer','Credit');

--
-- Table structure for table `bank_waitlist`
--

DROP TABLE IF EXISTS `bank_waitlist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bank_waitlist` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `joined` datetime DEFAULT NULL,
  `offer` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_allowed_access` tinyint(1) NOT NULL DEFAULT '0',
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bank_waitlist_user_id_fk` (`user_id`),
  CONSTRAINT `bank_waitlist_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bank_waitlist`
--


--
-- Table structure for table `banking_direct_user_session`
--

DROP TABLE IF EXISTS `banking_direct_user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `banking_direct_user_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `token` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `banking_direct_user_session_user_id_fk` (`user_id`),
  KEY `banking_direct_user_session_token_idx` (`token`),
  CONSTRAINT `banking_direct_user_session_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `banking_direct_user_session`
--


--
-- Table structure for table `campaign_info`
--

DROP TABLE IF EXISTS `campaign_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_info` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `device_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `network` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adgroup` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `click_label` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `idfa` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_connected_date` datetime DEFAULT NULL,
  `appsflyer_device_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appsflyer_installed_date` datetime DEFAULT NULL,
  `dave_installed_date` datetime DEFAULT NULL,
  `app_version` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attributed_touch_time` datetime DEFAULT NULL,
  `attributed_touch_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `platform` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os_version` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_retargeting` tinyint(1) DEFAULT NULL,
  `appsflyer_install_event_received` tinyint(1) DEFAULT NULL,
  `keywords` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adset` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer_id` int(11) DEFAULT NULL,
  `referrer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer_image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `appsflyer_uninstalled_date` datetime DEFAULT NULL,
  `campaign_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appsflyer_device_id_idx` (`appsflyer_device_id`),
  KEY `campaign_info_user_id_fk` (`user_id`),
  KEY `campaign_info_idfa_idx` (`idfa`),
  KEY `device_id_idx` (`device_id`),
  KEY `referrer_id_user_id_fk` (`referrer_id`),
  KEY `campaign_id_idx` (`campaign_id`),
  KEY `network_idx` (`network`),
  CONSTRAINT `referrer_id_user_id_fk` FOREIGN KEY (`referrer_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaign_info`
--


--
-- Table structure for table `campaign_info_contributor`
--

DROP TABLE IF EXISTS `campaign_info_contributor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_info_contributor` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `network_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_type_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_time_1` datetime DEFAULT NULL,
  `network_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_type_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_time_2` datetime DEFAULT NULL,
  `network_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_type_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `touch_time_3` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `appsflyer_device_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `appsflyer_device_id` (`appsflyer_device_id`),
  KEY `network_1_idx` (`network_1`),
  KEY `network_2_idx` (`network_2`),
  KEY `network_3_idx` (`network_3`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaign_info_contributor`
--


--
-- Table structure for table `config`
--

DROP TABLE IF EXISTS `config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` json NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `config`
--


--
-- Table structure for table `creative_spend`
--

DROP TABLE IF EXISTS `creative_spend`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `creative_spend` (
  `spend_date_pacific_time` date NOT NULL,
  `network` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `adset` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creative_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `keyword` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `adset_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creative_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creative_text` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creative_width` int(11) DEFAULT NULL,
  `creative_height` int(11) DEFAULT NULL,
  `creative_is_video` tinyint(1) DEFAULT NULL,
  `impressions` int(11) DEFAULT NULL,
  `spend` decimal(16,2) DEFAULT NULL,
  `clicks` int(11) DEFAULT NULL,
  `installs` int(11) DEFAULT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL,
  PRIMARY KEY (`spend_date_pacific_time`,`network`,`campaign_id`,`device_type`,`adset_id`,`creative_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `creative_spend`
--


--
-- Table structure for table `creative_spend_audit`
--

DROP TABLE IF EXISTS `creative_spend_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `creative_spend_audit` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `spend_date_pacific_time` date DEFAULT NULL,
  `type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `json` json DEFAULT NULL,
  `created` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `creative_spend_audit`
--


--
-- Table structure for table `credit_pop_code`
--

DROP TABLE IF EXISTS `credit_pop_code`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `credit_pop_code` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `code` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `credit_pop_code_user_id_fk` (`user_id`),
  CONSTRAINT `credit_pop_code_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `credit_pop_code`
--


--
-- Table structure for table `daily_balance_log`
--

DROP TABLE IF EXISTS `daily_balance_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_balance_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_connection_id` int(11) NOT NULL,
  `bank_account_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `current` decimal(16,2) DEFAULT NULL,
  `available` decimal(16,2) DEFAULT NULL,
  `plaid_account_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_daily_balance_log_bank_account_id_date` (`bank_account_id`,`date`),
  KEY `daily_balance_log_user_id_fk` (`user_id`),
  KEY `daily_balance_log_bank_connection_id` (`bank_connection_id`),
  CONSTRAINT `daily_balance_log_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `daily_balance_log_bank_connection_id` FOREIGN KEY (`bank_connection_id`) REFERENCES `bank_connection` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_balance_log`
--


--
-- Table structure for table `dave_banking_call_session`
--

DROP TABLE IF EXISTS `dave_banking_call_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dave_banking_call_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `agent_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `zendesk_ticket_id` int(11) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `call_reasons` json NOT NULL,
  `verified_parameters` json NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zendesk_ticket_id` (`zendesk_ticket_id`),
  KEY `dave_banking_call_session_customer_id_fk` (`customer_id`),
  KEY `dave_banking_call_session_agent_id_fk` (`agent_id`),
  CONSTRAINT `dave_banking_call_session_agent_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `dave_banking_call_session_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dave_banking_call_session`
--


--
-- Table structure for table `delete_request`
--

DROP TABLE IF EXISTS `delete_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delete_request` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `additional_info` text COLLATE utf8mb4_unicode_ci,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `zendesk_ticket_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `initiator_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delete_request_user_id_fk` (`user_id`),
  KEY `delete_request_reason_idx` (`reason`),
  KEY `delete_request_initiator_id_foreign` (`initiator_id`),
  CONSTRAINT `delete_request_initiator_id_foreign` FOREIGN KEY (`initiator_id`) REFERENCES `user` (`id`),
  CONSTRAINT `delete_request_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delete_request`
--


--
-- Table structure for table `donation_organization`
--

DROP TABLE IF EXISTS `donation_organization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donation_organization` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `donation_organization_code_unique` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donation_organization`
--

INSERT INTO `donation_organization` VALUES (1,'UNKNOWN','UNKNOWN','2020-03-31 23:33:25','2020-03-31 23:33:25'),(2,'Trees for the Future','TREES','2020-03-31 23:33:25','2020-03-31 23:33:25'),(3,'Feeding America','FEEDING_AMERICA','2020-03-31 23:33:25','2020-03-31 23:33:25');

--
-- Table structure for table `email_verification`
--

DROP TABLE IF EXISTS `email_verification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `email` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `verified` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_verification_user_id_fk` (`user_id`),
  KEY `email_verification_verified_idx` (`verified`),
  KEY `email_verification_email_index` (`email`),
  CONSTRAINT `email_verification_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_verification`
--


--
-- Table structure for table `empyr_event`
--

DROP TABLE IF EXISTS `empyr_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empyr_event` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `payment_method_id` int(11) NOT NULL,
  `transaction_id` int(11) NOT NULL,
  `card_id` int(11) NOT NULL,
  `event_type` enum('AUTHORIZED','CLEARED','REMOVED','REMOVED_DUP') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cleared_amount` decimal(16,2) DEFAULT NULL,
  `authorized_amount` decimal(16,2) DEFAULT NULL,
  `reward_amount` decimal(16,2) DEFAULT NULL,
  `transaction_date` datetime NOT NULL,
  `processed_date` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `commission` decimal(16,2) DEFAULT NULL,
  `venue_id` int(11) DEFAULT NULL,
  `venue_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `venue_thumbnail_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `venue_address` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `venue_city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `venue_state` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `venue_postal_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `empyr_event_payment_method_id_fk` (`payment_method_id`),
  KEY `empyr_event_user_id_fk` (`user_id`),
  KEY `empyr_event_transaction_date_idx` (`transaction_date`),
  KEY `empyr_event_transaction_id_idx` (`transaction_id`),
  CONSTRAINT `empyr_event_payment_method_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `empyr_event_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `empyr_event`
--


--
-- Table structure for table `expected_transaction`
--

DROP TABLE IF EXISTS `expected_transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `expected_transaction` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `recurring_transaction_id` int(11) DEFAULT NULL,
  `bank_account_id` int(11) NOT NULL,
  `display_name` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expected_date` date NOT NULL,
  `expected_amount` decimal(16,2) NOT NULL,
  `status` enum('PREDICTED','PENDING','SETTLED') COLLATE utf8mb4_unicode_ci DEFAULT 'PREDICTED',
  `pending_date` date DEFAULT NULL,
  `settled_date` date DEFAULT NULL,
  `pending_display_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pending_amount` decimal(16,2) DEFAULT NULL,
  `settled_amount` decimal(16,2) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `bank_transaction_id` bigint(20) DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `u_recurring_id_x_expected_date` (`recurring_transaction_id`,`expected_date`),
  KEY `bank_transaction_id_fk` (`bank_transaction_id`),
  KEY `expected_transaction_bank_account_id_idx` (`bank_account_id`),
  CONSTRAINT `bank_transaction_id_fk` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transaction` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recurring_transaction_id` FOREIGN KEY (`recurring_transaction_id`) REFERENCES `recurring_transaction` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expected_transaction`
--


--
-- Table structure for table `forecast`
--

DROP TABLE IF EXISTS `forecast`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forecast` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) NOT NULL,
  `start_balance` decimal(16,2) DEFAULT NULL,
  `lowest_balance` decimal(16,2) DEFAULT NULL,
  `pending` json NOT NULL,
  `recurring` json NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `paycheck` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `forecast_bank_account_id` (`bank_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `forecast`
--


--
-- Table structure for table `fraud_alert`
--

DROP TABLE IF EXISTS `fraud_alert`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_alert` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved` datetime DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `fraud_rule_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fraud_alert_user_id_fk` (`user_id`),
  KEY `fraud_alert_fraud_rule_id_fk` (`fraud_rule_id`),
  CONSTRAINT `fraud_alert_fraud_rule_id_fk` FOREIGN KEY (`fraud_rule_id`) REFERENCES `fraud_rule` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `fraud_alert_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fraud_alert`
--


--
-- Table structure for table `fraud_rule`
--

DROP TABLE IF EXISTS `fraud_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_rule` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `phone_number` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line_1` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line_2` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zip_code` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by_user_id` int(11) DEFAULT NULL,
  `updated_by_user_id` int(11) DEFAULT NULL,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fraud_rule_updated_by_user_id_fk` (`updated_by_user_id`),
  KEY `fraud_rule_created_by_user_id_fk` (`created_by_user_id`),
  CONSTRAINT `fraud_rule_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fraud_rule_updated_by_user_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fraud_rule`
--


--
-- Table structure for table `incident`
--

DROP TABLE IF EXISTS `incident`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incident` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `creator_id` int(11) DEFAULT NULL,
  `resolver_id` int(11) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `incident_resolver_id_fk` (`resolver_id`),
  KEY `incident_creator_id_fk` (`creator_id`),
  KEY `active_incident_idx` (`resolved_at`,`deleted`),
  CONSTRAINT `incident_creator_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `incident_resolver_id_fk` FOREIGN KEY (`resolver_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `incident`
--


--
-- Table structure for table `income_override_request`
--

DROP TABLE IF EXISTS `income_override_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `income_override_request` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `conversation_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `addressed` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversation_id` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `income_override_request`
--

--
-- Table structure for table `institution`
--

DROP TABLE IF EXISTS `institution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `institution` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `display_name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plaid_institution_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo` mediumtext COLLATE utf8mb4_unicode_ci,
  `account_locked` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `forgot_password` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_color` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username_label` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_label` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pin_label` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balance_includes_pending` tinyint(1) NOT NULL DEFAULT '1',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `mx_institution_code` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `plaid_institution_id` (`plaid_institution_id`),
  UNIQUE KEY `mx_institution_code` (`mx_institution_code`),
  KEY `institution_display_name_idx` (`display_name`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `institution`
--

INSERT INTO `institution` VALUES (1,'Bank of Dave','bank_of_dave','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','https://dave.com','https://dave.com','#0B9A40','Email','Password',NULL,1,'2019-12-30 20:57:33','2019-12-30 20:57:33',NULL),(2,'Gottlieb - King','1',NULL,NULL,NULL,'#1b5551','username','password',NULL,1,'2020-03-31 23:32:37','2020-03-31 23:32:37',NULL),(3,'Emmerich, Von and Champlin','2',NULL,NULL,NULL,'#123721','username','password',NULL,1,'2020-03-31 23:32:40','2020-03-31 23:32:40',NULL),(4,'Runolfsdottir, Runte and Kuhn','3',NULL,NULL,NULL,'#387b7c','username','password',NULL,1,'2020-03-31 23:32:41','2020-03-31 23:32:41',NULL),(7,'Bernhard, Ortiz and Padberg','animi-aliquam-et',NULL,NULL,NULL,'#7c603a','username','password',NULL,1,'2020-04-02 20:48:00','2020-04-02 20:48:00',NULL),(9,'Denesik, Willms and Hauck','voluptate-quos-non',NULL,NULL,NULL,'#666929','username','password',NULL,1,'2020-04-02 20:53:28','2020-04-02 20:53:28',NULL),(10,'Borer Inc','odit-consequuntur-aut',NULL,NULL,NULL,'#2c2c7d','username','password',NULL,1,'2020-04-02 20:53:30','2020-04-02 20:53:30',NULL),(11,'Daniel - Berge','molestiae-sint-repellendus',NULL,NULL,NULL,'#2c351a','username','password',NULL,1,'2020-04-02 20:53:31','2020-04-02 20:53:31',NULL);

--
-- Table structure for table `knex_migrations`
--

DROP TABLE IF EXISTS `knex_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch` int(11) DEFAULT NULL,
  `migration_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `knex_migrations_lock`
--

DROP TABLE IF EXISTS `knex_migrations_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knex_migrations_lock` (
  `index` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `is_locked` int(11) DEFAULT NULL,
  PRIMARY KEY (`index`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `knex_migrations_lock`
--

INSERT INTO `knex_migrations_lock` VALUES (1,0);

--
-- Table structure for table `membership_pause`
--

DROP TABLE IF EXISTS `membership_pause`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `membership_pause` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `unpaused_at` datetime NOT NULL DEFAULT '9999-12-31 23:59:59',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paused_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pauser_id` int(11) DEFAULT NULL,
  `unpauser_id` int(11) DEFAULT NULL,
  `extra` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `active_membership_pause_idx` (`user_id`,`unpaused_at`),
  KEY `membership_pause_pauser_id_foreign` (`pauser_id`),
  KEY `membership_pause_unpauser_id_foreign` (`unpauser_id`),
  CONSTRAINT `membership_pause_pauser_id_foreign` FOREIGN KEY (`pauser_id`) REFERENCES `user` (`id`),
  CONSTRAINT `membership_pause_unpauser_id_foreign` FOREIGN KEY (`unpauser_id`) REFERENCES `user` (`id`),
  CONSTRAINT `membership_pause_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `membership_pause`
--


--
-- Table structure for table `merchant_info`
--

DROP TABLE IF EXISTS `merchant_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_info` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unique_users_count` int(11) DEFAULT NULL,
  `exclude` tinyint(1) NOT NULL DEFAULT '0',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant_info`
--

INSERT INTO `merchant_info` VALUES (1,'','','','',0,0,'2019-07-03 20:36:20','2019-07-03 20:36:20'),(4403,'ace cash express','ACE Cash Express','','https://storage.googleapis.com/dave-images/images-production/merchants/ace-cash-express@3x-20200416.png',841,0,'2018-09-19 18:30:09','2018-09-19 18:30:09'),(4495,'acme','ACME','','https://storage.googleapis.com/dave-images/images-production/merchants/acme@3x.png',601,0,'2018-09-19 18:30:17','2018-09-19 18:30:17'),(4500,'acorns','Acorns','','https://storage.googleapis.com/dave-images/images-production/merchants/acorns@3x-20200416.png',3500,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(4565,'advance america','Advance America','','https://storage.googleapis.com/dave-images/images-production/merchants/advance-america@3x-20200416.png',532,0,'2018-09-19 18:30:20','2018-09-19 18:30:20'),(4625,'airbnb','Airbnb','','https://storage.googleapis.com/dave-images/images-production/merchants/airbnb@3x-01.png',564,0,'2018-09-19 18:30:19','2018-09-19 18:30:19'),(4672,'albertson','Albertson\'s Grocery','','https://storage.googleapis.com/dave-images/images-production/merchants/albertsons-grocery@3x.png',1817,0,'2018-09-19 18:29:53','2018-09-19 18:29:53'),(4675,'aldi','ALDI','','https://storage.googleapis.com/dave-images/images-production/merchants/aldi@3x.png',3440,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(4699,'aliexpress','ALIEXPRESS','','https://storage.googleapis.com/dave-images/images-production/merchants/aliexpress@3x.png',516,0,'2018-09-19 18:30:21','2018-09-19 18:30:21'),(4725,'allstate','Allstate','','https://storage.googleapis.com/dave-images/images-production/merchants/allstate@3x-20200416.png',925,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(4778,'amazon','Amazon','','https://storage.googleapis.com/dave-images/images-production/merchants/amazon@3x-20200416.png',31513,0,'2018-09-19 18:29:34','2018-09-19 18:29:34'),(4801,'american airlines','American Airlines','','https://storage.googleapis.com/dave-images/images-production/merchants/american-airlines@3x.png',628,0,'2018-09-19 18:30:15','2018-09-19 18:30:15'),(4806,'american express','AMERICAN EXPRESS','','https://storage.googleapis.com/dave-images/images-production/merchants/american-express@3x.png',943,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(4983,'apple pay cash','Apple','','https://storage.googleapis.com/dave-images/images-production/merchants/apple@3x-20200416.png',1110,0,'2018-09-19 18:30:02','2018-09-19 18:30:02'),(4984,'apple pay sent','Apple','','https://storage.googleapis.com/dave-images/images-production/merchants/apple@3x-20200416.png',1166,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(4987,'applebee','Applebee\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/applebees@3x.png',3740,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(5008,'aramark','Aramark','','https://storage.googleapis.com/dave-images/images-production/merchants/aramark@3x.png',1564,0,'2018-09-19 18:29:55','2018-09-19 18:29:55'),(5013,'arbys','Arby\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/arbys@3x.png',3133,0,'2018-09-19 18:29:44','2018-09-19 18:29:44'),(5018,'arco','ARCO','','https://storage.googleapis.com/dave-images/images-production/merchants/arco@3x.png',5555,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(5130,'chipotle','Chipotle Mexican Grill','','https://storage.googleapis.com/dave-images/images-production/merchants/chipotle-mexican-grill@3x.png',6704,0,'2018-09-19 18:29:38','2018-09-19 18:29:38'),(5166,'marathon','Marathon','','https://storage.googleapis.com/dave-images/images-production/merchants/marathon-gas@3x.png',5205,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(5194,'sprint','Sprint','','https://storage.googleapis.com/dave-images/images-production/merchants/sprint@3x-20200416.png',4779,0,'2018-09-19 18:29:40','2018-09-19 18:29:40'),(5207,'uber trip','Uber','','https://storage.googleapis.com/dave-images/images-production/merchants/uber@3x-20200416.png',8302,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(5366,'audible','Audible','','https://storage.googleapis.com/dave-images/images-production/merchants/audible@3x.png',1528,0,'2018-09-19 18:29:55','2018-09-19 18:29:55'),(5376,'auntie anne','Auntie Anne\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/auntie-annes@3x.png',1772,0,'2018-09-19 18:29:53','2018-09-19 18:29:53'),(5491,'autozone','AutoZone','','https://storage.googleapis.com/dave-images/images-production/merchants/autozone@3x.png',5117,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(5662,'bank of america','Bank of America','','https://storage.googleapis.com/dave-images/images-production/merchants/bank-of-america@3x-20200416.png',1815,0,'2018-09-19 18:29:53','2018-09-19 18:29:53'),(5726,'barnes noble','Barnes & Noble','','https://storage.googleapis.com/dave-images/images-production/merchants/barnes-noble@3x.png',883,0,'2018-09-19 18:30:42','2018-09-19 18:30:42'),(5761,'bath body works','Bath & Body Works','','https://storage.googleapis.com/dave-images/images-production/merchants/bath-body-works@3x.png',965,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(5925,'best buy','Best Buy','','https://storage.googleapis.com/dave-images/images-production/merchants/best-buy@3x.png',3905,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(5958,'big lots','Big Lots','','https://storage.googleapis.com/dave-images/images-production/merchants/big-lots@3x.png',2092,0,'2018-09-19 18:29:51','2018-09-19 18:29:51'),(6030,'bkofamerica','Bank of America','','https://storage.googleapis.com/dave-images/images-production/merchants/bank-of-america@3x-20200416.png',12603,0,'2018-09-19 18:30:41','2018-09-19 18:30:41'),(6146,'boost mobile','Boost Mobile','','https://storage.googleapis.com/dave-images/images-production/merchants/boost-mobile@3x-20200416.png',2453,0,'2018-09-19 18:29:49','2018-09-19 18:29:49'),(6157,'boston market','Boston Market','','https://storage.googleapis.com/dave-images/images-production/merchants/boston-market@3x.png',601,0,'2018-09-19 18:30:17','2018-09-19 18:30:17'),(6357,'buffalo wild wings','Buffalo Wild Wings','','https://storage.googleapis.com/dave-images/images-production/merchants/buffalo-wild-wings@3x.png',2745,0,'2018-09-19 18:29:47','2018-09-19 18:29:47'),(6380,'burger king','Burger King','','https://storage.googleapis.com/dave-images/images-production/merchants/burger-king@3x.png',18839,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(6609,'capital one','CAPITAL ONE','','https://storage.googleapis.com/dave-images/images-production/merchants/capital-one@3x-20200416.png',13935,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(6667,'cvs pharmacy','CVS','','https://storage.googleapis.com/dave-images/images-production/merchants/cvs@3x.png',7624,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(6877,'winco foods','Winco Foods','','https://storage.googleapis.com/dave-images/images-production/merchants/winco-foods@3x.png',1258,0,'2018-09-19 18:29:59','2018-09-19 18:29:59'),(6897,'cardtronics','Cardtronics','','https://storage.googleapis.com/dave-images/images-production/merchants/cardtronics@3x.png',3581,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(7360,'party city','Party City','','https://storage.googleapis.com/dave-images/images-production/merchants/party-city@3x.png',969,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(8194,'wingstop','Wingstop','','https://storage.googleapis.com/dave-images/images-production/merchants/wingstop@3x.png',2468,0,'2018-09-19 18:29:49','2018-09-19 18:29:49'),(8407,'dennys','Denny\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/dennys@3x.png',2846,0,'2018-09-19 18:29:46','2018-09-19 18:29:46'),(8491,'mcalisters','McAlister\'s Deli','','https://storage.googleapis.com/dave-images/images-production/merchants/mcalisters-deli@3x.png',509,0,'2018-09-19 18:30:21','2018-09-19 18:30:21'),(9071,'jersey mikes subs','Jersey Mike\'s Subs','','https://storage.googleapis.com/dave-images/images-production/merchants/jersey-mikes-subs@3x.png',631,0,'2018-09-19 18:30:15','2018-09-19 18:30:15'),(9630,'king soopers','King Soopers','','https://storage.googleapis.com/dave-images/images-production/merchants/king-soopers@3x.png',573,0,'2018-09-19 18:30:18','2018-09-19 18:30:18'),(9728,'single discover payment','DISCOVER Card','','https://storage.googleapis.com/dave-images/images-production/merchants/discover-card@3x.png',1874,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(10751,'charlotte russe','Charlotte Russe','','https://storage.googleapis.com/dave-images/images-production/merchants/charlotte-russe@3x.png',907,0,'2018-09-19 18:30:07','2018-09-19 18:30:07'),(12197,'rallys','Rally\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/checkers-and-rallys@3x.png',1906,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(13205,'carters','Carter\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/carters@3x.png',940,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(13653,'churchs chicken','Church\'s Chicken','','https://storage.googleapis.com/dave-images/images-production/merchants/churchs-chicken@3x.png',1226,0,'2018-09-19 18:30:00','2018-09-19 18:30:00'),(13929,'dollar general','Dollar General','','https://storage.googleapis.com/dave-images/images-production/merchants/dollar-general@3x.png',2601,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(15027,'petroleu','Admiral Petroleum','','https://storage.googleapis.com/dave-images/images-production/merchants/admiral-petroleum@3x.png',1055,0,'2018-09-19 18:30:04','2018-09-19 18:30:04'),(16202,'hulu','Hulu','','https://storage.googleapis.com/dave-images/images-production/merchants/hulu@3x-20200416.png',7163,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(16772,'time warner cabl','Time Warner Cable','','https://storage.googleapis.com/dave-images/images-production/merchants/time-warner-cable@3x.png',2298,0,'2018-09-19 18:29:50','2018-09-19 18:29:50'),(16997,'holiday station store','Holiday Station Store','','https://storage.googleapis.com/dave-images/images-production/merchants/holiday-station-store@3x.png',677,0,'2018-09-19 18:30:14','2018-09-19 18:30:14'),(17373,'microsoft xb','MICROSOFT *XBOX','','https://storage.googleapis.com/dave-images/images-production/merchants/microsoft-xbox@3x.png',5796,0,'2018-09-19 18:29:38','2018-09-19 18:29:38'),(17538,'poshmark','POSHMARK','','https://storage.googleapis.com/dave-images/images-production/merchants/poshmark@3x.png',574,0,'2018-09-19 18:30:18','2018-09-19 18:30:18'),(17593,'jimmy john','JIMMY JOHNS','','https://storage.googleapis.com/dave-images/images-production/merchants/jimmy-johns@3x.png',2963,0,'2018-09-19 18:29:45','2018-09-19 18:29:45'),(17732,'fred meyer','Fred Meyer','','https://storage.googleapis.com/dave-images/images-production/merchants/fred-meyer@3x.png',993,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(17737,'planet fitnes','Planet Fitness','','https://storage.googleapis.com/dave-images/images-production/merchants/planet-fitness@3x-20200416.png',1913,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(17772,'metropcs','MetroPCS','','https://storage.googleapis.com/dave-images/images-production/merchants/metropcs@3x-20200416.png',5679,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(18046,'frys food drg','Fry\'s Food and Drug','','https://storage.googleapis.com/dave-images/images-production/merchants/frys-food-and-drug@3x.png',1493,0,'2018-09-19 18:29:56','2018-09-19 18:29:56'),(18246,'cumberland farm','CUMBERLAND FARMS','','https://storage.googleapis.com/dave-images/images-production/merchants/cumberland-farms@3x.png',1067,0,'2018-09-19 18:30:03','2018-09-19 18:30:03'),(18336,'family dollar','Family Dollar','','https://storage.googleapis.com/dave-images/images-production/merchants/family-dollar@3x.png',12890,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(18355,'zaxbys','Zaxby\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/zaxbys@3x.png',3316,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(18389,'qapital','QAPITAL','','https://storage.googleapis.com/dave-images/images-production/merchants/qapital@3x.png',1316,0,'2018-09-19 18:29:58','2018-09-19 18:29:58'),(18496,'winn dixie','Winn-Dixie','','https://storage.googleapis.com/dave-images/images-production/merchants/winn-dixie@3x.png',1642,0,'2018-09-19 18:29:54','2018-09-19 18:29:54'),(18592,'mcdonald','McDonald\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/mcdonalds@3x-20200416.png',53788,0,'2018-09-19 18:29:34','2018-09-19 18:29:34'),(18644,'jiffy lube','Jiffy Lube','','https://storage.googleapis.com/dave-images/images-production/merchants/jiffy-lube@3x.png',503,0,'2018-09-19 18:30:22','2018-09-19 18:30:22'),(18744,'ruby tuesday','Ruby Tuesday','','https://storage.googleapis.com/dave-images/images-production/merchants/ruby-tuesday@3x.png',474,0,'2018-09-19 18:30:24','2018-09-19 18:30:24'),(18807,'sport clips','Sport Clips','','https://storage.googleapis.com/dave-images/images-production/merchants/sport-clips@3x.png',496,0,'2018-09-19 18:30:22','2018-09-19 18:30:22'),(18847,'papa johns','Papa John\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/papa-johns@3x.png',4121,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(18862,'tropical smoothie cafe','Tropical Smoothie Cafe','','https://storage.googleapis.com/dave-images/images-production/merchants/tropical-smoothie-cafe@3x.png',707,0,'2018-09-19 18:30:13','2018-09-19 18:30:13'),(19039,'zumiez','Zumiez','','https://storage.googleapis.com/dave-images/images-production/merchants/zumiez@3x.png',537,0,'2018-09-19 18:30:20','2018-09-19 18:30:20'),(19094,'sbarro','Sbarro','','undefined',503,0,'2018-09-19 18:30:22','2018-09-19 18:30:22'),(19109,'wienerschnitzel','Wienerschnitzel','','https://storage.googleapis.com/dave-images/images-production/merchants/wienerschnitzel@3x.png',499,0,'2018-09-19 18:30:22','2018-09-19 18:30:22'),(19133,'public storage','Public Storage','','https://storage.googleapis.com/dave-images/images-production/merchants/public-storage@3x-20200416.png',709,0,'2018-09-19 18:30:13','2018-09-19 18:30:13'),(19205,'cinnabon','Cinnabon','','https://storage.googleapis.com/dave-images/images-production/merchants/cinnabon@3x.png',561,0,'2018-09-19 18:30:19','2018-09-19 18:30:19'),(19207,'hot topic','Hot Topic','','https://storage.googleapis.com/dave-images/images-production/merchants/hot-topic@3x.png',553,0,'2018-09-19 18:30:19','2018-09-19 18:30:19'),(19249,'spirit airlines','Spirit Airlines','','https://storage.googleapis.com/dave-images/images-production/merchants/spirit-airlines@3x.png',471,0,'2018-09-19 18:30:24','2018-09-19 18:30:24'),(19293,'dish network','DISH Network','','https://storage.googleapis.com/dave-images/images-production/merchants/dish-network@3x-20200416.png',529,0,'2018-09-19 18:30:20','2018-09-19 18:30:20'),(19329,'cold stone creamery','Cold Stone Creamery','','https://storage.googleapis.com/dave-images/images-production/merchants/cold-stone-creamery@3x.png',600,0,'2018-09-19 18:30:17','2018-09-19 18:30:17'),(19349,'centurylink','CenturyLink','','https://storage.googleapis.com/dave-images/images-production/merchants/century-link@3x-20200416.png',604,0,'2018-09-19 18:30:16','2018-09-19 18:30:16'),(19473,'ymca','YMCA','','https://storage.googleapis.com/dave-images/images-production/merchants/ymca@3x-20200416.png',611,0,'2018-09-19 18:30:16','2018-09-19 18:30:16'),(19519,'ebay','Ebay','','https://storage.googleapis.com/dave-images/images-production/merchants/ebay@3x.png',738,0,'2018-09-19 18:30:12','2018-09-19 18:30:12'),(19542,'office depot','Office Depot','','https://storage.googleapis.com/dave-images/images-production/merchants/office-depot@3x.png',555,0,'2018-09-19 18:30:19','2018-09-19 18:30:19'),(19585,'marshall','MARSHALLS','','https://storage.googleapis.com/dave-images/images-production/merchants/marshalls@3x.png',2600,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(19739,'pollo tropical','Pollo Tropical','','https://storage.googleapis.com/dave-images/images-production/merchants/pollo-tropical@3x.png',587,0,'2018-09-19 18:30:17','2018-09-19 18:30:17'),(19748,'cents only store','99Cents Only Store','','https://storage.googleapis.com/dave-images/images-production/merchants/99cents-only-store@3x.png',540,0,'2018-09-19 18:30:20','2018-09-19 18:30:20'),(19968,'google music','Google Music','','https://storage.googleapis.com/dave-images/images-production/merchants/google-music@3x-20200416.png',769,0,'2018-09-19 18:30:11','2018-09-19 18:30:11'),(20012,'weis markets','Weis Markets','','https://storage.googleapis.com/dave-images/images-production/merchants/weis-markets@3x.png',451,0,'2018-09-19 18:30:25','2018-09-19 18:30:25'),(20023,'texas roadhouse','Texas Roadhouse','','https://storage.googleapis.com/dave-images/images-production/merchants/texas-roadhouse@3x.png',952,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(20026,'el pollo loco','El Pollo Loco','','https://storage.googleapis.com/dave-images/images-production/merchants/el-pollo-loco@3x.png',742,0,'2018-09-19 18:30:12','2018-09-19 18:30:12'),(20027,'la fitness','LA Fitness','','https://storage.googleapis.com/dave-images/images-production/merchants/la-fitness@3x-20200416.png',812,0,'2018-09-19 18:30:10','2018-09-19 18:30:10'),(20057,'ikea','IKEA','','https://storage.googleapis.com/dave-images/images-production/merchants/ikea@3x-01.png',709,0,'2018-09-19 18:30:13','2018-09-19 18:30:13'),(20080,'five guys','Five Guys','','https://storage.googleapis.com/dave-images/images-production/merchants/five-guys@3x.png',922,0,'2018-09-19 18:30:07','2018-09-19 18:30:07'),(20122,'taco cabana','Taco Cabana','','https://storage.googleapis.com/dave-images/images-production/merchants/taco-cabana@3x.png',763,0,'2018-09-19 18:30:11','2018-09-19 18:30:11'),(20161,'cracker barrel','Cracker Barrel Old Country Store','','https://storage.googleapis.com/dave-images/images-production/merchants/cracker-barrel-old-country-store@3x.png',917,0,'2018-09-19 18:30:07','2018-09-19 18:30:07'),(20164,'regal cinemas','Regal Cinemas','','https://storage.googleapis.com/dave-images/images-production/merchants/regal-cinemas@3x.png',784,0,'2018-09-19 18:30:10','2018-09-19 18:30:10'),(20182,'six flags','Six Flags','','https://storage.googleapis.com/dave-images/images-production/merchants/six-flags@3x-20200416.png',829,0,'2018-09-19 18:30:09','2018-09-19 18:30:09'),(20184,'piggly wiggly','Piggly Wiggly','','https://storage.googleapis.com/dave-images/images-production/merchants/piggly-wiggly@3x.png',650,0,'2018-09-19 18:30:14','2018-09-19 18:30:14'),(20187,'red lobster','Red Lobster','','https://storage.googleapis.com/dave-images/images-production/merchants/red-lobster@3x.png',1115,0,'2018-09-19 18:30:02','2018-09-19 18:30:02'),(20192,'checkers and rally','Checkers and Rally\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/checkers-and-rallys@3x.png',937,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(20201,'macys','Macy\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/macys@3x.png',760,0,'2018-09-19 18:30:11','2018-09-19 18:30:11'),(20212,'great clips','Great Clips','','https://storage.googleapis.com/dave-images/images-production/merchants/great-clips@3x.png',1122,0,'2018-09-19 18:30:02','2018-09-19 18:30:02'),(20233,'jamba juice','Jamba Juice','','https://storage.googleapis.com/dave-images/images-production/merchants/jamba-juice@3x.png',851,0,'2018-09-19 18:30:08','2018-09-19 18:30:08'),(20285,'firehouse subs','Firehouse Subs','','https://storage.googleapis.com/dave-images/images-production/merchants/firehouse-subs@3x.png',997,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(20294,'moviepass','Moviepass','','https://storage.googleapis.com/dave-images/images-production/merchants/moviepass@3x.png',1062,0,'2018-09-19 18:30:03','2018-09-19 18:30:03'),(20325,'red robin','Red Robin','','https://storage.googleapis.com/dave-images/images-production/merchants/red-robin@3x.png',1152,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(20326,'payless','Payless Shoesource','','https://storage.googleapis.com/dave-images/images-production/merchants/payless-shoesource@3x.png',993,0,'2018-09-19 18:30:41','2018-09-19 18:30:41'),(20347,'planet fit','Planet Fitness','','https://storage.googleapis.com/dave-images/images-production/merchants/planet-fitness@3x-20200416.png',2805,0,'2018-09-19 18:29:47','2018-09-19 18:29:47'),(20354,'qdoba','Qdoba','','https://storage.googleapis.com/dave-images/images-production/merchants/qdoba@3x.png',1055,0,'2018-09-19 18:30:04','2018-09-19 18:30:04'),(20357,'sephora','Sephora','','https://storage.googleapis.com/dave-images/images-production/merchants/sephora@3x.png',1221,0,'2018-09-19 18:30:00','2018-09-19 18:30:00'),(20392,'duane reade','Duane Reade','','https://storage.googleapis.com/dave-images/images-production/merchants/duane-reade@3x.png',623,0,'2018-09-19 18:30:16','2018-09-19 18:30:16'),(20397,'enterprise rent car','Enterprise Rent-A-Car','','https://storage.googleapis.com/dave-images/images-production/merchants/enterprise-rent-a-car@3x.png',1126,0,'2018-09-19 18:30:02','2018-09-19 18:30:02'),(20405,'nike','Nike','','https://storage.googleapis.com/dave-images/images-production/merchants/nike@3x.png',1184,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(20409,'lendup','LENDUP','','https://storage.googleapis.com/dave-images/images-production/merchants/lend-up@3x.png',843,0,'2018-09-19 18:30:09','2018-09-19 18:30:09'),(20420,'wells fargo','Wells Fargo','','https://storage.googleapis.com/dave-images/images-production/merchants/wells-fargo@3x-20200416.png',8560,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(20424,'kohls','Kohl\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/kohls@3x.png',1203,0,'2018-09-19 18:30:00','2018-09-19 18:30:00'),(20436,'victoria secret','Victoria\'s Secret','','https://storage.googleapis.com/dave-images/images-production/merchants/victorias-secret@3x.png',1441,0,'2018-09-19 18:29:56','2018-09-19 18:29:56'),(20444,'firehouse','Firehouse Subs','','https://storage.googleapis.com/dave-images/images-production/merchants/firehouse-subs@3x.png',1145,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(20470,'jpay','JPAY','','https://storage.googleapis.com/dave-images/images-production/merchants/jpay@3x.png',925,0,'2018-09-19 18:30:07','2018-09-19 18:30:07'),(20494,'gulf oil','Gulf Oil','','https://storage.googleapis.com/dave-images/images-production/merchants/gulf-oil@3x.png',859,0,'2018-09-19 18:30:08','2018-09-19 18:30:08'),(20498,'harris teeter supermarkets','Harris Teeter Supermarkets, Inc.','','https://storage.googleapis.com/dave-images/images-production/merchants/harris-teeter-supermarkets-inc@3x.png',647,0,'2018-09-19 18:30:15','2018-09-19 18:30:15'),(20512,'golden corral','Golden Corral','','https://storage.googleapis.com/dave-images/images-production/merchants/golden-corral@3x.png',1357,0,'2018-09-19 18:29:57','2018-09-19 18:29:57'),(20528,'costco gas','Costco Gas','','https://storage.googleapis.com/dave-images/images-production/merchants/costco-gas@3x.png',874,0,'2018-09-19 18:30:08','2018-09-19 18:30:08'),(20534,'wegmans','Wegmans Food Markets','','https://storage.googleapis.com/dave-images/images-production/merchants/wegmans@3x.png',599,0,'2018-09-19 18:30:42','2018-09-19 18:30:42'),(20536,'smoothie king','Smoothie King','','https://storage.googleapis.com/dave-images/images-production/merchants/smoothie-king@3x.png',1055,0,'2018-09-19 18:30:04','2018-09-19 18:30:04'),(20557,'lowes','LOWES','','https://storage.googleapis.com/dave-images/images-production/merchants/lowes@3x.png',1072,0,'2018-09-19 18:30:03','2018-09-19 18:30:03'),(20563,'krispy kreme','Krispy Kreme','','https://storage.googleapis.com/dave-images/images-production/merchants/krispy-kreme@3x.png',1384,0,'2018-09-19 18:29:57','2018-09-19 18:29:57'),(20570,'giant eagle','Giant Eagle','','https://storage.googleapis.com/dave-images/images-production/merchants/giant-eagle@3x.png',767,0,'2018-09-19 18:30:11','2018-09-19 18:30:11'),(20578,'fandango','Fandango','','https://storage.googleapis.com/dave-images/images-production/merchants/fandango@3x.png',1286,0,'2018-09-19 18:29:58','2018-09-19 18:29:58'),(20579,'navy exchange','NAVY EXCHANGE','','https://storage.googleapis.com/dave-images/images-production/merchants/navy-exchange@3x.png',452,0,'2018-09-19 18:30:25','2018-09-19 18:30:25'),(20589,'suntrust','SUNTRUST bank','','https://storage.googleapis.com/dave-images/images-production/merchants/suntrust-bank@3x.png',765,0,'2018-09-19 18:30:11','2018-09-19 18:30:11'),(20592,'nordstrom','Nordstrom','','https://storage.googleapis.com/dave-images/images-production/merchants/nordstrom@3x.png',909,0,'2018-09-19 18:30:07','2018-09-19 18:30:07'),(20612,'staples','Staples','','https://storage.googleapis.com/dave-images/images-production/merchants/staples@3x.png',1032,0,'2018-09-19 18:30:04','2018-09-19 18:30:04'),(20619,'kmart','Kmart','','https://storage.googleapis.com/dave-images/images-production/merchants/kmart@3x.png',1141,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(20650,'pilot travel','Pilot Travel Center','','https://storage.googleapis.com/dave-images/images-production/merchants/pilot-travel-center@3x.png',943,0,'2018-09-19 18:30:06','2018-09-19 18:30:06'),(20651,'pilot travel center','Pilot Travel Center','','https://storage.googleapis.com/dave-images/images-production/merchants/pilot-travel-center@3x.png',1036,0,'2018-09-19 18:30:04','2018-09-19 18:30:04'),(20667,'caseys gen store','CASEYS GEN STORE','','https://storage.googleapis.com/dave-images/images-production/merchants/caseys-gen-store@3x.png',711,0,'2018-09-19 18:30:13','2018-09-19 18:30:13'),(20719,'etsy','Etsy','','https://storage.googleapis.com/dave-images/images-production/merchants/etsy@3x.png',1326,0,'2018-09-19 18:29:58','2018-09-19 18:29:58'),(20725,'michaels','MICHAELS STORES','','https://storage.googleapis.com/dave-images/images-production/merchants/michaels@3x.png',3174,0,'2018-09-19 18:29:44','2018-09-19 18:29:44'),(20734,'petco','Petco','','https://storage.googleapis.com/dave-images/images-production/merchants/petco@3x.png',1491,0,'2018-09-19 18:29:56','2018-09-19 18:29:56'),(20737,'white castle','White Castle','','https://storage.googleapis.com/dave-images/images-production/merchants/white-castle@3x.png',1449,0,'2018-09-19 18:29:56','2018-09-19 18:29:56'),(20745,'fedex','FedEx','','https://storage.googleapis.com/dave-images/images-production/merchants/fedex@3x-01.png',1219,0,'2018-09-19 18:30:00','2018-09-19 18:30:00'),(20783,'sally beauty','SALLY BEAUTY','','https://storage.googleapis.com/dave-images/images-production/merchants/sally-beauty@3x.png',1717,0,'2018-09-19 18:29:53','2018-09-19 18:29:53'),(20796,'cinemark theatres','Cinemark Theatres','','https://storage.googleapis.com/dave-images/images-production/merchants/cinemark-theatres@3x-20200416.png',1226,0,'2018-09-19 18:30:00','2018-09-19 18:30:00'),(20802,'texaco','Texaco','','https://storage.googleapis.com/dave-images/images-production/merchants/texaco@3x.png',1334,0,'2018-09-19 18:29:57','2018-09-19 18:29:57'),(20810,'vons','Vons','','https://storage.googleapis.com/dave-images/images-production/merchants/vons@3x.png',1003,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(20813,'ulta','ULTA','','https://storage.googleapis.com/dave-images/images-production/merchants/public-storage@3x.png',1652,0,'2018-09-19 18:29:54','2018-09-19 18:29:54'),(20840,'cricket wireless','Cricket Wireless','','https://storage.googleapis.com/dave-images/images-production/merchants/cricket-wireless@3x-20200416.png',1927,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(20844,'olive garden','Olive Garden','','https://storage.googleapis.com/dave-images/images-production/merchants/olive-garden@3x.png',1993,0,'2018-09-19 18:29:51','2018-09-19 18:29:51'),(20851,'trader joe','Trader Joe\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/trader-joes@3x.png',1338,0,'2018-09-19 18:29:57','2018-09-19 18:29:57'),(20891,'tim hortons','Tim Hortons','','https://storage.googleapis.com/dave-images/images-production/merchants/tim-hortons@3x.png',1015,0,'2018-09-19 18:30:05','2018-09-19 18:30:05'),(20901,'conoco','Conoco','','https://storage.googleapis.com/dave-images/images-production/merchants/conoco@3x.png',1283,0,'2018-09-19 18:29:58','2018-09-19 18:29:58'),(20921,'jcpenney','JCPenney','','https://storage.googleapis.com/dave-images/images-production/merchants/jcpenney@3x.png',1912,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(20930,'forever','FOREVER 21','','undefined',2068,0,'2018-09-19 18:30:41','2018-09-19 18:30:41'),(20946,'old navy','Old Navy','','https://storage.googleapis.com/dave-images/images-production/merchants/old-navy@3x.png',2141,0,'2018-09-19 18:29:50','2018-09-19 18:29:50'),(21001,'goodwill','Goodwill','','https://storage.googleapis.com/dave-images/images-production/merchants/goodwill@3x.png',2053,0,'2018-09-19 18:29:51','2018-09-19 18:29:51'),(21010,'chipotle mexican','Chipotle Mexican Grill','','https://storage.googleapis.com/dave-images/images-production/merchants/chipotle-mexican-grill@3x.png',2235,0,'2018-09-19 18:29:50','2018-09-19 18:29:50'),(21039,'state farm','State Farm','','https://storage.googleapis.com/dave-images/images-production/merchants/state-farm@3x-20200416.png',2404,0,'2018-09-19 18:29:49','2018-09-19 18:29:49'),(21040,'kwik trip','Kwik Trip','','https://storage.googleapis.com/dave-images/images-production/merchants/kwik-trip@3x.png',732,0,'2018-09-19 18:30:12','2018-09-19 18:30:12'),(21063,'five below','Five Below','','https://storage.googleapis.com/dave-images/images-production/merchants/five-below@3x.png',2702,0,'2018-09-19 18:29:47','2018-09-19 18:29:47'),(21074,'cook out','Cook Out','','https://storage.googleapis.com/dave-images/images-production/merchants/cook-out@3x.png',2227,0,'2018-09-19 18:29:50','2018-09-19 18:29:50'),(21076,'checkers','Checkers and Rally\'s','','https://storage.googleapis.com/dave-images/images-production/merchants/checkers-and-rallys@3x.png',2630,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(21079,'petsmart','PetSmart','','https://storage.googleapis.com/dave-images/images-production/merchants/petsmart@3x.png',2612,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(21103,'coinbase','COINBASE','','https://storage.googleapis.com/dave-images/images-production/merchants/coinbase@3x.png',1155,0,'2018-09-19 18:30:01','2018-09-19 18:30:01'),(21109,'waffle house','Waffle House','','https://storage.googleapis.com/dave-images/images-production/merchants/waffle-house@3x.png',2932,0,'2018-09-19 18:29:45','2018-09-19 18:29:45'),(21113,'metropolitan transportation','Metropolitan Transportation Authority','','https://storage.googleapis.com/dave-images/images-production/merchants/metropolitan-transportation-authority@3x.png',1507,0,'2018-09-19 18:29:56','2018-09-19 18:29:56'),(21115,'oreilly auto','OREILLY AUTO','','https://storage.googleapis.com/dave-images/images-production/merchants/oreilly-auto@3x.png',2659,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(21137,'gamestop','GameStop','','https://storage.googleapis.com/dave-images/images-production/merchants/gamestop@3x.png',3043,0,'2018-09-19 18:29:45','2018-09-19 18:29:45'),(21156,'ihop','IHOP','','https://storage.googleapis.com/dave-images/images-production/merchants/ihop@3x.png',3775,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21214,'dunkin donuts','Dunkin\' Donuts','','https://storage.googleapis.com/dave-images/images-production/merchants/dunkin-donuts@3x.png',2567,0,'2018-09-19 18:29:48','2018-09-19 18:29:48'),(21219,'verizon','VERIZON','','https://storage.googleapis.com/dave-images/images-production/merchants/verizon@3x-20200416.png',4002,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21228,'whole foods','Whole Foods','','https://storage.googleapis.com/dave-images/images-production/merchants/whole-foods@3x.png',1974,0,'2018-09-19 18:29:51','2018-09-19 18:29:51'),(21229,'groupon','Groupon','','undefined',3250,0,'2018-09-19 18:29:43','2018-09-19 18:29:43'),(21245,'google play','Google Play','','https://storage.googleapis.com/dave-images/images-production/merchants/google-play@3x-20200416.png',2073,0,'2018-09-19 18:29:51','2018-09-19 18:29:51'),(21246,'pepsico','PepsiCo','','https://storage.googleapis.com/dave-images/images-production/merchants/pepsico@3x.png',1854,0,'2018-09-19 18:29:52','2018-09-19 18:29:52'),(21266,'costco','Costco','','https://storage.googleapis.com/dave-images/images-production/merchants/costco@3x.png',2781,0,'2018-09-19 18:29:47','2018-09-19 18:29:47'),(21284,'comcast','Comcast','','https://storage.googleapis.com/dave-images/images-production/merchants/comcast@3x-20200416.png',5119,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(21287,'dairy queen','Dairy Queen','','https://storage.googleapis.com/dave-images/images-production/merchants/dairy-queen@3x.png',4290,0,'2018-09-19 18:29:40','2018-09-19 18:29:40'),(21288,'panera bread','Panera Bread','','https://storage.googleapis.com/dave-images/images-production/merchants/panera-bread@3x.png',3968,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21295,'usps','USPS','','https://storage.googleapis.com/dave-images/images-production/merchants/usps@3x.png',5029,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(21300,'panda express','Panda Express','','https://storage.googleapis.com/dave-images/images-production/merchants/panda-express@3x.png',5083,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(21302,'geico','GEICO','','https://storage.googleapis.com/dave-images/images-production/merchants/geico@3x-20200416.png',5534,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(21304,'meijer','Meijer','','https://storage.googleapis.com/dave-images/images-production/merchants/meijer@3x.png',2395,0,'2018-09-19 18:29:49','2018-09-19 18:29:49'),(21308,'giant','GIANT','','https://storage.googleapis.com/dave-images/images-production/merchants/giant@3x.png',3144,0,'2018-09-19 18:29:44','2018-09-19 18:29:44'),(21315,'postmates','Postmates','','https://storage.googleapis.com/dave-images/images-production/merchants/postmates@3x-20200416.png',2708,0,'2018-09-19 18:29:47','2018-09-19 18:29:47'),(21317,'whataburger','Whataburger','','https://storage.googleapis.com/dave-images/images-production/merchants/whataburger@3x.png',3923,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21319,'grubhub','GrubHub','','https://storage.googleapis.com/dave-images/images-production/merchants/grubhub@3x-20200416.png',3552,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(21325,'home depot','Home Depot','','https://storage.googleapis.com/dave-images/images-production/merchants/home-depot@3x.png',4120,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21340,'redbox','Redbox','','https://storage.googleapis.com/dave-images/images-production/merchants/redbox@3x.png',4849,0,'2018-09-19 18:29:40','2018-09-19 18:29:40'),(21350,'rite aid','Rite Aid','','https://storage.googleapis.com/dave-images/images-production/merchants/rite-aid@3x.png',4664,0,'2018-09-19 18:29:40','2018-09-19 18:29:40'),(21354,'spotify','Spotify','','https://storage.googleapis.com/dave-images/images-production/merchants/spotify@3x-20200416.png',7692,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21361,'food lion','Food Lion','','https://storage.googleapis.com/dave-images/images-production/merchants/food-lion@3x.png',3592,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(21368,'pizza hut','Pizza Hut','','https://storage.googleapis.com/dave-images/images-production/merchants/pizza-hut@3x.png',7464,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21370,'sheetz','Sheetz','','https://storage.googleapis.com/dave-images/images-production/merchants/sheetz@3x.png',3058,0,'2018-09-19 18:29:44','2018-09-19 18:29:44'),(21391,'safeway','Safeway','','https://storage.googleapis.com/dave-images/images-production/merchants/safeway@3x.png',4084,0,'2018-09-19 18:29:41','2018-09-19 18:29:41'),(21394,'citgo','Citgo','','https://storage.googleapis.com/dave-images/images-production/merchants/citgo@3x.png',5456,0,'2018-09-19 18:29:39','2018-09-19 18:29:39'),(21409,'jack in the','Jack in the Box','','https://storage.googleapis.com/dave-images/images-production/merchants/jack-in-the-box@3x.png',7099,0,'2018-09-19 18:29:38','2018-09-19 18:29:38'),(21417,'exxonmobil','ExxonMobil','','https://storage.googleapis.com/dave-images/images-production/merchants/exxonmobil@3x.png',6698,0,'2018-09-19 18:29:38','2018-09-19 18:29:38'),(21447,'google','Google','','https://storage.googleapis.com/dave-images/images-production/merchants/google@3x-20200416.png',7158,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21478,'sunoco','Sunoco','','https://storage.googleapis.com/dave-images/images-production/merchants/sunoco@3x.png',8322,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21479,'netflix','Netflix','','https://storage.googleapis.com/dave-images/images-production/merchants/netflix@3x-20200416.png',18496,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21484,'wawa','Wawa','','https://storage.googleapis.com/dave-images/images-production/merchants/wawa@3x.png',6088,0,'2018-09-19 18:29:38','2018-09-19 18:29:38'),(21489,'venmo','Venmo','','https://storage.googleapis.com/dave-images/images-production/merchants/venmo@3x-20200416.png',8033,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21490,'subway','Subway','','https://storage.googleapis.com/dave-images/images-production/merchants/subway@3x.png',14924,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21491,'chick fil','Chick-fil-A','','https://storage.googleapis.com/dave-images/images-production/merchants/chick-fil-a@3x.png',13713,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(21508,'usaa','USAA','','https://storage.googleapis.com/dave-images/images-production/merchants/usaa@3x-20200416.png',3580,0,'2018-09-19 18:29:42','2018-09-19 18:29:42'),(21525,'chevron','Chevron','','https://storage.googleapis.com/dave-images/images-production/merchants/chevron@3x.png',14100,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(21527,'chase','Chase','','https://storage.googleapis.com/dave-images/images-production/merchants/chase@3x-20200416.png',9328,0,'2018-09-19 18:29:37','2018-09-19 18:29:37'),(21528,'target','Target','','https://storage.googleapis.com/dave-images/images-production/merchants/target@3x.png',16206,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21533,'walgreens','Walgreens','','https://storage.googleapis.com/dave-images/images-production/merchants/walgreens@3x.png',17621,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21534,'starbucks','Starbucks','','https://storage.googleapis.com/dave-images/images-production/merchants/starbucks@3x.png',15042,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21537,'taco bell','Taco Bell','','https://storage.googleapis.com/dave-images/images-production/merchants/taco-bell@3x.png',22703,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21540,'earnin','Earnin\'','','https://storage.googleapis.com/dave-images/images-production/merchants/earnin@3x-20200416.png',13139,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(21557,'paypal','PAYPAL','','https://storage.googleapis.com/dave-images/images-production/merchants/paypal@3x-20200416.png',14644,0,'2018-09-19 18:29:36','2018-09-19 18:29:36'),(21564,'7-eleven','7-Eleven','','https://storage.googleapis.com/dave-images/images-production/merchants/7-Eleven@3x-01.png',33816,0,'2018-09-19 18:29:34','2018-09-19 18:29:34'),(21565,'shell','Shell','','https://storage.googleapis.com/dave-images/images-production/merchants/shell@3x-20200416.png',30678,0,'2018-09-19 18:29:34','2018-09-19 18:29:34'),(21567,'lyft','Lyft','','https://storage.googleapis.com/dave-images/images-production/merchants/lyft@3x-20200416.png',15326,0,'2018-09-19 18:29:35','2018-09-19 18:29:35'),(21569,'walmart','Walmart','','https://storage.googleapis.com/dave-images/images-production/merchants/walmart@3x-20200416.png',53751,0,'2018-09-19 18:29:34','2018-09-19 18:29:34'),(21572,'dave inc','Dave Inc','','https://storage.googleapis.com/dave-images/images-production/merchants/dave-inc@3x-20200416.png',100000,0,'2018-09-21 16:31:26','2018-09-21 16:31:26');

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification`
--

INSERT INTO `notification` VALUES (1,'AUTO_ADVANCE_APPROVAL','2019-12-30 20:57:32'),(2,'LOW_BALANCE','2019-12-30 20:57:32');

--
-- Table structure for table `onboarding_step`
--

DROP TABLE IF EXISTS `onboarding_step`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `onboarding_step` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `step` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `onboarding_step_user_id_fk` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `onboarding_step`
--


--
-- Table structure for table `payment`
--

DROP TABLE IF EXISTS `payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) DEFAULT NULL,
  `payment_method_id` int(11) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `external_processor` enum('TABAPAY','SYNAPSEPAY','BANK_OF_DAVE') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','UNKNOWN','COMPLETED','RETURNED','CANCELED','CHARGEBACK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `legacy_id` int(11) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `webhook_data` json DEFAULT NULL,
  `bank_transaction_id` bigint(20) DEFAULT NULL,
  `reference_id` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `modifications` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_id` (`external_id`),
  KEY `payment_payment_method_id_fk` (`payment_method_id`),
  KEY `payment_bank_account_id_fk` (`bank_account_id`),
  KEY `payment_user_id_fk` (`user_id`),
  KEY `payment_advance_id_fk` (`advance_id`),
  KEY `payment_bank_transaction_id_fk` (`bank_transaction_id`),
  KEY `payment_reference_id_idx` (`reference_id`),
  KEY `payment_status` (`status`),
  CONSTRAINT `payment_advance_id_fk` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `payment_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `payment_bank_transaction_id_fk` FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transaction` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT `payment_payment_method_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `payment_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment`
--


--
-- Table structure for table `payment_method`
--

DROP TABLE IF EXISTS `payment_method`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_method` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) NOT NULL,
  `availability` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `risepay_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tabapay_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mask` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` date NOT NULL,
  `scheme` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `invalid` datetime DEFAULT NULL,
  `invalid_reason_code` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked` tinyint(1) DEFAULT '0',
  `zip_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `opted_into_dave_rewards` tinyint(1) NOT NULL DEFAULT '0',
  `empyr_card_id` int(11) DEFAULT NULL,
  `bin` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `risepay_id` (`risepay_id`),
  UNIQUE KEY `tabapay_id` (`tabapay_id`),
  KEY `payment_method_user_id_fk` (`user_id`),
  KEY `payment_method_invalid_reason_idx` (`invalid_reason_code`),
  KEY `payment_method_bank_account_id_fk` (`bank_account_id`),
  KEY `payment_method_empyr_card_id_idx` (`empyr_card_id`),
  CONSTRAINT `payment_method_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_method_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_method`
--


--
-- Table structure for table `payment_reversal`
--

DROP TABLE IF EXISTS `payment_reversal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_reversal` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_id` int(11) NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `status` enum('COMPLETED','PENDING','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reversed_by_user_id` int(11) DEFAULT NULL,
  `note` varchar(5000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payment_reversal_user_id_fk` (`reversed_by_user_id`),
  KEY `payment_reversal_payment_id_fk` (`payment_id`),
  KEY `payment_reversals_status` (`status`),
  CONSTRAINT `payment_reversal_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payment` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `payment_reversal_user_id_fk` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_reversal`
--


--
-- Table structure for table `phone_number_change_request`
--

DROP TABLE IF EXISTS `phone_number_change_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phone_number_change_request` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `old_phone_number` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `new_phone_number` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `verification_code` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `phone_number_change_request_user_id_fk` (`user_id`),
  CONSTRAINT `phone_number_change_request_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `phone_number_change_request`
--


--
-- Table structure for table `plaid_balance_check`
--

DROP TABLE IF EXISTS `plaid_balance_check`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plaid_balance_check` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_connection_id` int(11) NOT NULL,
  `successful` tinyint(1) DEFAULT NULL,
  `trigger` enum('USER_REFRESH','ADVANCE_COLLECTION','SUBSCRIPTION_COLLECTION','ADVANCE_APPROVAL','DEBIT_MICRO_DEPOSIT') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `response_time` int(11) DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `advance_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `plaid_balance_check_bank_connection_id` (`bank_connection_id`),
  KEY `plaid_balance_check_trigger` (`trigger`),
  KEY `plaid_balance_check_advance_id` (`advance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plaid_balance_check`
--

--
-- Table structure for table `recurring_transaction`
--

DROP TABLE IF EXISTS `recurring_transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recurring_transaction` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_account_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `transaction_display_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interval` enum('MONTHLY','SEMI_MONTHLY','BIWEEKLY','WEEKLY','WEEKDAY_MONTHLY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `params` json NOT NULL,
  `user_display_name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_amount` decimal(10,0) NOT NULL,
  `terminated` date DEFAULT NULL,
  `skip_validity_check` tinyint(1) NOT NULL DEFAULT '0',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `pending_display_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dtstart` date NOT NULL,
  `missed` datetime DEFAULT NULL,
  `roll_direction` int(11) NOT NULL DEFAULT '0',
  `possible_name_change` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT '9999-12-31 23:59:59',
  `type` enum('INCOME','EXPENSE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXPENSE',
  `status` enum('VALID','NOT_VALIDATED','INVALID_NAME','MISSED','PENDING_VERIFICATION') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_VALIDATED',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bid_name_deleted_type_uix` (`bank_account_id`,`deleted`,`transaction_display_name`,`type`),
  KEY `recurring_transaction_user_id_fk` (`user_id`),
  KEY `recurring_transaction_id_display_name_type` (`bank_account_id`,`transaction_display_name`),
  CONSTRAINT `recurring_transaction_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recurring_transaction_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recurring_transaction`
--


--
-- Table structure for table `redeemed_subscription_billing_promotion`
--

DROP TABLE IF EXISTS `redeemed_subscription_billing_promotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `redeemed_subscription_billing_promotion` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `subscription_billing_promotion_id` int(10) unsigned NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `redeemed_subscription_billing_promotion_limit_idx` (`user_id`,`subscription_billing_promotion_id`),
  KEY `redeemed_subscription_billing_promotion_promotion_id_fk` (`subscription_billing_promotion_id`),
  CONSTRAINT `redeemed_subscription_billing_promotion_promotion_id_fk` FOREIGN KEY (`subscription_billing_promotion_id`) REFERENCES `subscription_billing_promotion` (`id`),
  CONSTRAINT `redeemed_subscription_billing_promotion_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `redeemed_subscription_billing_promotion`
--


--
-- Table structure for table `reimbursement`
--

DROP TABLE IF EXISTS `reimbursement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reimbursement` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `external_processor` enum('TABAPAY','SYNAPSEPAY','BLASTPAY','PAYPAL','BANK_OF_DAVE','RISEPAY','PAYFI') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','UNKNOWN','COMPLETED','RETURNED','CANCELED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payable_id` int(11) DEFAULT NULL,
  `payable_type` enum('PAYMENT_METHOD','BANK_ACCOUNT') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `webhook_data` json DEFAULT NULL,
  `advance_id` int(11) DEFAULT NULL,
  `reimburser_id` int(11) DEFAULT NULL,
  `zendesk_ticket_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `reference_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subscription_payment_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_id` (`external_id`),
  KEY `reimbursement_user_id_fk` (`user_id`),
  KEY `payable_type_payable_id` (`payable_type`,`payable_id`),
  KEY `reimbursement_reimburser_id_foreign` (`reimburser_id`),
  KEY `reimbursement_subscription_payment_id_foreign` (`subscription_payment_id`),
  KEY `reimbursement_advance_id_foreign` (`advance_id`),
  CONSTRAINT `reimbursement_advance_id_foreign` FOREIGN KEY (`advance_id`) REFERENCES `advance` (`id`),
  CONSTRAINT `reimbursement_reimburser_id_foreign` FOREIGN KEY (`reimburser_id`) REFERENCES `user` (`id`),
  CONSTRAINT `reimbursement_subscription_payment_id_foreign` FOREIGN KEY (`subscription_payment_id`) REFERENCES `subscription_payment` (`id`),
  CONSTRAINT `reimbursement_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reimbursement`
--


--
-- Table structure for table `rewards_ledger`
--

DROP TABLE IF EXISTS `rewards_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rewards_ledger` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `empyr_event_id` int(11) NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rewards_ledger_empyr_event_id_fk` (`empyr_event_id`),
  KEY `rewards_ledger_user_id_fk` (`user_id`),
  CONSTRAINT `rewards_ledger_empyr_event_id_fk` FOREIGN KEY (`empyr_event_id`) REFERENCES `empyr_event` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `rewards_ledger_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rewards_ledger`
--


--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role`
--

INSERT INTO `role` VALUES (1,'tester','2019-12-30 20:57:32'),(10,'v2BankTester','2020-03-31 23:33:25'),(11, 'GoalTester', '2021-02-16 23:52:07');

--
-- Table structure for table `side_hustle_applications`
--

DROP TABLE IF EXISTS `side_hustle_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `side_hustle_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `side_hustle_job_id` int(11) NOT NULL,
  `email` enum('PRIMARY','SECONDARY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `blockers` json DEFAULT NULL,
  `successful` tinyint(1) NOT NULL DEFAULT '0',
  `admin_id` int(11) DEFAULT NULL,
  `status` enum('REQUESTED','CONTACTED','OPENED','CLICKED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `side_hustle_applications_job_id_fk` (`side_hustle_job_id`),
  KEY `side_hustle_applications_user_id_fk` (`user_id`),
  KEY `side_hustle_applications_admin_id_fk` (`admin_id`),
  CONSTRAINT `side_hustle_applications_admin_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `side_hustle_applications_job_id_fk` FOREIGN KEY (`side_hustle_job_id`) REFERENCES `side_hustle_jobs` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `side_hustle_applications_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `side_hustle_applications`
--


--
-- Table structure for table `side_hustle_jobs`
--

DROP TABLE IF EXISTS `side_hustle_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `side_hustle_jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tagline` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logo` mediumtext COLLATE utf8mb4_unicode_ci,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `deleted` datetime DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `affiliate_link` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_blurb` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_img` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sms_blurb` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `side_hustle_jobs_active_idx` (`active`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `side_hustle_jobs`
--

INSERT INTO `side_hustle_jobs` VALUES (1,'Airbnb Host','Make money hosting your place','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',1,NULL,'2018-12-13 01:43:55','2018-12-13 01:43:55','http://airbnb.evyy.net/c/1260018/290446/4560?subId1=USER_ID&sharedid=000_Dave.com','You\'ll want to have at least 1 high quality photo of your place to feature it for a listing.','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/airbnb.jpg','Airbnb',NULL),(2,'Instacart Shopper','Have a car? Get paid to shop','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',1,NULL,'2018-12-13 01:43:55','2018-12-13 01:43:55','http://instacart-shoppers.sjv.io/c/1297951/471903/8281?subId1=USER_ID&sharedid=000_Dave.com','You\'ll just need to fill out basic info like where you live and what phone you have.','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/instacart.jpg','Instacart',NULL),(3,'Uber Eats Delivery Partner','Get paid for bringing people the food they love from local restaurants','iVBORw0KGgoAAAANSUhEUgAAAH4AAAB+CAYAAADiI6WIAAAAAXNSR0IArs4c6QAAGV9JREFUeAHtXQlwVOWWPlnJvi8kIZCEXUABQXbl4XN5is9CfeUurm9KZ3R0LCnnOVXWVE3puD3RZ7mO+hRxHeeh4ojggiIS4MkWZJM1kJCE7Onsy53z/Z3b/d/b3enbfbudTvc9VT936X8933/Of875/xuiyHfK5CKXc7qI02hOhYMpha8WBZ8DNm6iejBV8nUDp885NXEKCi3jWr/h1MtJsVJI8QCYABtgFDBawDVt5mSBPTx4AKyAmd8UwyVXcrIAH548AHbA0CfK4NzrOVmgD28eAENgaYiQcR8nC/Tw4AGwdAE/WjcVoBo+5DRZ9956HL4cAJbAVKP2NQ/847OcbuBkUXhxYCwPJ53TOnfDgiVoqffw5oHD2o+SZgDcgPnSs3Ubfhz4kYckwFfXeDj+FujhB7R+RMBYBHlU4O/V57Cew5YDAmuo+kxOdZxiw3ao1sBkDvTxQx4kfiknC3SZNeF9D6yXAnjsslkUWRy4CMAXR9aYrdECcwBfaLEi4jhQCOOujZN1iCKysLcBeETrLIowDkDVWxSBHLCAj0DQMWQLeAv4COVAhA7bkngL+AjlQIQO25J4C/gI5UCEDtvUrtyECRPo0Ucfpehou+KIioqin376iZ566im/2JmUlESPPfYYjRw5khRFIdRXXV1NK1asoL4+7CYSpaWl0eOPP07Z2dmOPFu2bKHnnnvOrzYjuZDf5+wWLlzI+Ghp/fr1fteXmZmpVFVVaSqsrKxURowY4agzPz9fqa+v1+T55JNPHL8zkNa9AR6YWuMHBgaov79fIzQ9PT2aZ18eGE3q6urSFNE/u8tjpk1NYxH0YAr4COJT2A3VAj7sIDU2IAt4Y3wKu1wW8GEHqbEBWcAb41PY5TLlx4cqN+Lj42n69Ok0a9YsmjRpErGbSL29vVRTU0P79u2jbdu20aFDh0x3PyYmhqZOnUpz5swR7aixBXY3He2gPXg/3igvL4+KiopEbAJ5UQZ9VL2a4uJi0VZWVpb4bcOGDYR2zJDffu/8+fMVDqxofOq1a9f6XV9GRoZy5MgRTX08eI0fzwxSTp06pcnz0UcfiTYTExOVO++8U+GAjsJAa/LID62trQr6eeWVVyocfPK5v7Gxscr111+vbNy4Uens7JSr1ty3t7crDJCybNkyhYNRQ7bDQSrBS/ATyWazKZMnT1ZKSkqUt956yyV2sWDBgiHr4wnh7XevGTxWECrAr169WmHJU7799lsN4408fPzxx0ppaanHMeoZOHHiROXzzz83UrUmzwcffKCwRHts5+GHH9bkx+S84447lF9++UXzHg+YGOC9vm8+Pg9/4Pfu3ascP37chUFGXxw8eFCZOXOmV0bOnj3bRSMZbQP5du7cqZSVlbltRw88NAkvTR6rNyvxYbHGT5kyhSe7llhiaOvWrXTgwAFqbm4mrI2sOonBo9TUVE1m7Dmw5NNll11G+/fv1/ymPpx11lnESwqNGTNGfeW47tmzhzZv3iz2FXgZINYgtHjxYho9Gn8NzkmwO95//31aunQp1dXhqzXPlJCQQEgyNTQ0iD0LREsDEa10OwO5Qa/vQ0XVy2LBDFF4w0asj/oxYJ3lSaK89NJLLrYJ6vjhhx+U5ORkl3HjHX7T09GjR8Vaz5tLLmWwp/DII48obW1t+mLKyy+/7JJfL/Fyoa+++kq5/PLLlcLCQgX1IsXFxbnUoR+vl2fvAHuqINSAb2lpUa699lpDDLnxxhsV5NfTgw8+6FL+vvvu02dTKioqFKz3nnijvmfpdmkHapw9AU1ZT8C/8847Cku+Jq9at8lreAAPK/7mm2/2iUG33Xabi+RDitktc9TDy4LCy4UG+KamJgXrvVHG33PPPQq7Z5o6XnvtNU15d8CjL7m5uZp8Rtv0li9sAjjvvfcerVq1isdrnN58802xtsslsD4vWbLE8eqCCy4glmzHM25ef/112r59u+bdUA+vvPIK/fgj/hiFky655BJhdzjfuN5hTGfOnHH9IQBvwgJ4BDleeOEFv9jx/PPPi+COXPjiiy92PAIgmTo6OojVL8GIM5pQHoahTAjWnHPOOfIrl3sYp8GisLDq2del3bt3+8UjdrEI5WG1qyR7CYjMyYRoHTSFkWicXC4lRft5Ik4tsWtHHHuQsznueV0Q3ojjRYBvwgJ4uGzd3d1+sQYSzH68BniEeNlqFkfKcnJyNPXyaSARDta89POhoKBgyJIAP1hkCnjMen3n2PURDPNVIjBAnLFD8pXgs5shtrI1xRHrR0JfMAGCRfp4QrDacVevKeAbGxsJTJMHwD4mQSr0zHTXuP4dJg3H6/WvvT5DcgCSfhJ6LTiYAZsrMkELoP9Qxxxvl38Szxwp9LsttTIsGceOHVMff/WrKeBra2sJ0SQZeOwiIboF9esrcdjUL+CxPqenp/u1JkKV69dxRNWgsZCwoycTtAtv7niNvMllPN37O1E91efLe1NWPZiAbUeZYMTwbpT8yvD9DTfc4JeqR2hUdsEMN8gZYcHDwpapvLzc8ai3rHH0G20BNLPJ0cj/w40p4DHwdetc/zzq3Xff7RKn9jY2MBOS5A9BJePsvd5y9lYXtMRDDz2kycY7X5oxYXzYy1cJS8oDDzxAWJZ8IfQR7l8okanIEKt1l71inhDKp59+6jbuzQN3aQ87Vqw5UMyFjOzHq4VefPFFhddOl/rdtckgKByIUYs6rt99953Chp2jDuT7+uuvHb+rN88884wjj7v69e+efPJJ5csvv/QY5tVH7niZURYtWuRTG/o2vTy7AuGlgEtnnnjiCZUfmiv2rfkEjEt+uX6WdI+gozJfgEf+V199VRNyldtS79kYVN5++21k1xA2eFj1u/QX79wd7MC43W3QqO3gyl/+KCtXrnS0c/LkSbGxI08u5BuWwCOejE0Ld8QhR4WjagpveSpshIkTJTNmzFCuu+46BSdnOOrmrpjjna/AoyC0x/333y8mHat/BSdzcMVhDZx00Z/yURt79tlnXUBXQcSOnztie0C56aabxM4ZvvhhlS7aK+GTM3fddZeyY8cOl2LsMYi+qHUPW+DRcWxa8HduLoOUX+A4EXsBQx5XgtTJZAR4nEhxR9h9wyEL3i8XmgPte6IPP/xwSOmFZGOieiIcmgDI33//vWhP/5mXWg4qnO0KlyNfw1Li1ZmLUyHujgqpgx7qyocLlKefflrhjy412YwAv2bNGuXdd9/VlPPl4Y033hAaQR2Hpyu0Bodrfalakxd78/fee69brTKsgQfD2I9XwEioM6OEZeLqq68WUrBr1y5NMRyp0n80yX62Jg+2OGHUYS9d/9GlJqPuAZNq+fLlLtLnCXi8hypHGWgSXwgGIj4y9VQ3Dm3oiXcGPeb3VI/R9wH3L9h4odtvv534lAsxg4TPi4AOPoFWCYERRP2wQcIqVuxcsVoW7g78ZtwjD1wn1Id7lRCT59OthOPIzChCBAyxdhxHYktb1HXLLbcI1xDbqXJwSW2XJ5fYjkXb6IcvhDr41Ct99tlndM0119BVV11FbLOIz7bRF5VwNArBH2zHsjaiL774wvGpt5pHviKKt2nTJsdHqBgb7/vLWQJ6H/Q/cAjfGgESBFkQzoWfzFJMLJkC1ICORqoMYWM1ioiQLoA4ceKEOBeHyRRIwvjQBht0xIakiCBijKdPnzZ99j2Q/ZTrCjrwcmPWfehwwFTkLnSGYfXEVw5YwPvKsTDJbwEfJkD6OgwLeF85Fib5LeDDBEhfh2HKj0/MjKOyeTnsb3OzCDUEgrguhd32Iz/UU1ebczs0EFVbdTg5YAr4zKIkuuThqRxEwbEnZ6Vm7jCJ+nsVWnVoiwW8GUZ6KWsKeIDd38viORB44AM1kbyM39DP824ro6KzM6i/zxlBjI6OovK/HqWqihZDdYRaJlPAh9pggtWfkZMzaPzCPOrtcQIfExtFFWuruUkLeA3fo1gi/CGo+qgQMzkHWNL7GPR+CXgFWm4gQOubP4wyWSYoEg+GdLfz3571Q1+LNb6PDzIOY6aaxORXKR5w4KPZ0Gtr6qY1D++irlb/rXJbvX9fxvwqXAuDRgIOPHgCaW2t6TIFfCjx1pPiGugPoKrHyhjA6rzxLyjAo1FI/q9BydnxwuLOm5hGmaOSaERSrNin72juoYZj7XRqTxPV7m8VLiL6k1rAf2IklfM47TQ2KohaT3dRj62P4hJiKH1UoqPrmMQjUmJcVy0GKb0okbLLktkm0Y4VNkHTyU5SPEyMtJEJVDA1nbJLUiiD60hIiaOYuGjhNfR09HFfOqmxsoOq9zZT44kOR18CeRM04APZSXd1ZY5OounLimn8+XmUmpdA0bFsETJIQjoZBxziAPV29VHtwVba9T+VdODrWlr0x3E0aclIYayp9Uazhb720T10+PszlDM2hf6w8lwxGVQJxCQWbqtagK+Q9kV3jaeFd46T3tonfGttF713zzbqbNIudQB75tWjafSsLErKiGfhsFuxOHQh2hL9RnVwj9lO4gBWFYO/62+VdHRzg6Ydsw/DDvgoBmH6VaNo7s1llJqbIAAZYGNwoE/759NVxkAai6ZlUuHUDBq7sIagIcDwWOlbSACvThTMl1iWPmgBFXhPql6UExnV1uzAR8fZJ536FvnmLC+l2deV0IjkOK99VsvFJcTS2Hm5VDI7m/Z+UU0b/3KQetrdj1MtY/Q6rICPiY+m39w3gSV9tFCjvV0GmMDCpErrpCUFQp2qzyqT9MA6nr2tuYOCqtaDqyirKzfv1lKaf/s47odCfd26PkPKMXnERBvUWIMVQur7evA/dRBNv7KYJ00sffEfe7kOeZ2SWzd+HxyPGcyWfF7j3fGcE+p28b3jacZVo+0So1s/IdmxPDFiR8RQLK/TuGLdHNT4omI58ua5Jf4FIMhpqMxyPvl+sEzhtHSadX2p6LPsogrNwv0F9XT2ifB0H0dBoR0wDrnfmEyY5JMvHEnTrykerNncJeASj07GxMfQhCV5wpeXB2CkqwDQdqabTu1q1mSf9vtCmsGSjkCKqoJFBmY2VLOtsZuq9zRT3ZFW6mjupfSRiZQ3PpUKp2RQPBt8einXVK57EAABREguJ7EM4FlHYm2G8Em/KXwvAzz1skKKT4zVSDp4gnHs+LiSjm2tp7a6LtG/hNQ4SstPpHFst0xcnC/sFrmufl7SIPk/c8Sws0VrP+i65vUx8MCzgZWYFkeXrJgCjnntgD4D1PnhTXUM/A7HT2lsic+9ZazdEgcYg2S3phXa9elJ2r76ODWf0v6BA2QrmJrGanYslZ6Xawj8M4dttPofnH97Btb/b+6bRGPOzdKUhwba+OIhOrGtkaKch2vFJBhgld7V2kdY6/PGp2kmAvoEQ7T8vw7TtneO49FBLdRFtQfa6Jfv6ujkzkb67b9M5m/0nfsgMCjTCxKpaHoGHf7O3B9FCjjw6igwO7Wiqf7i5cpzRe8fn/37UUKCNWs6JIvVy8YXDtLO//Z8avb03lb65E+7acn9E+nspcUa8Nz1BG2c+cWm+amb3TyXOcztY6LVH9XmlQsmpsdTYkacC/Do91DlUMdeluoyNuzOupjtEmnZjE2MoXyeTCELvMwAM/fxKbE04YI8F8Cwfu/46MSQoKvt9nUN0LfPHSJsIxfPyHapS83n6eoC+mBGb7EKTKLeTjbmRAWSquLb8+8ez3ZINFXtbqb2Rvf/gdNm1grHy+v5uwJnWbRZp5uYnvo91PugSbw3pnjqFMrZVbg9R974FEovTNJoAbh0bXWdtI3Vu1ECAOWrjrFbl2m0iOl8vR39VM9BpNyxqexuOquDRkPw5op/P4faznRxHhsHatqpZn8LNVV1UDMHf7DXgQAUUjAo8MBDVbOat9V32ddkH3sdHR/FEuCM02ONhJUruzAxvEae+HuDMAJ9qR7S1XDCNgiEU4p8qcPXvBWfV9EENtYwmWVDDTwCpeYkUBobomPn85dBLNmw8DH+Zp4AtQfb2NZp5AheS8D8d7X/AQcexkh7Sxd9/OAO/yxPnjiyBZ6SO4L7yi81pBCMMF8Jk+fMkTbKn5AmJqev5f3Jf2JrA5WvPkrzl48jWPx6+0WocfbVVYKHklGQxMtSMpXN5SXuhlIO39ro53XVtOfTKo7mSapDLeTHNeDAow9w6eBumHU5UFd8Uowr7Fw/wpn+UG+nzv/ypxIfy2x5/ajQTog2pjOokGzE88EnPeGdiPFLcQosC4v/cSLbOvn05VP7qD4Aa3xwAjg8Gnmd1g/Ol2esdXr+wFZKSIv3pRpH3vhk+F76Gh0/B+UGLuGeNVUcv9/OLuBBqt7XLPx4uK4i0MRL11D8wrIAbQX75IpHzxZ7E2Y7GhSJN9spubytDhavDijWmXkTtP/ZgFzG030cu0J5MLQkafKUNxjv23jzZjv77js+OEHYZCo4K10sO/m8swj/HO6f2GxisYc7LNsE6A/CvbnjUum8m0ro6z/7/ufk5DGFPPC1B1vshh2W+UH8EXodMyubrf1Eaql2DdrIA5TvR5+bSVljkn+19V1uW75HzL7+SLtIFVQtwrRp+Qk8GZJZqtMptyyV8ielCcNPH2aGT48j7ZvTY6mrxf/1PuSBrz9i473tdsopSeVvx7E+M/68RqZkj6C5t5bSl49p/86ezGD5Hnvwc5eXiZ25ful7ezmPr/d6idSXz5+YSmNm5/Cabe83fo/inUEYa9gCVgmqvLmqU6RjW+z/pRiM2nOvHUPn/mGMRvLRZiJv6SIk3dXSplbh8zU4wLNkypa5z72SCvSwL3zgmxo6/48A3vkDNjSmXlpELXxoYevbx5i5zt/0dyMY9N+umMyqlY9IS1EwfT5fnrEmJ+fA4/BMCRy6XvxPE9iUdygrnnh8Lpf7fHpfC7XXuw/coEbsV2x/9zhNubSQD464if55btbQLwEHHlYpjJaSudnUbeu1b3AY6oozE0KaVXtaCAEQUMXaKpp2WRGl8Tqo+r9Q+5j9C3i7M6c0RTAJfq+6HKBcDMfKi2dm0bxbcS4+02/QxWYMlhqJYCfMubFUtFHH7WLccD+wxdrX08/RtTYOyLQK9zGLVbij35wthX33Cx+YTF89vY86dIc1pCZo7IJcPv2D00Ko3E6YcJ18lhH2ghkKPPBQRWxxL2Xr0x+CxS6+pLmznNdAu68Oydj85mH63Z+mieinYDJXjqvCanLShQVUNieHavikTf1xmzjrh0MamBAIAIljTSYkvQcnhnUElyuF21jyz5Pt7tfg74g8ttR20qo7ysUJHByggCsmHxSBNoRrll2STAe/raG6Q23s+vZQLxtvsbyzib6XnJdFE/n8AHYGxcRT62cPoLqimTp5B9IMBRx4tTPyDFffGbkCeFHWOclFsX3ratgwS6F57AuDcSr4+BHqG27R6JnZbPTlDDbDVjErDNgFZpedqoommra0aLBe5wWS2C8FX9RfZK9hzyenaNyiPBo1LUMTfUSfsoqThcbCeGHEoRwmDiYqAmFinDpp72nv5f2JSrUpv69B8+P97pGngjwRfnztCJW/c1T4vDiwIBMmAhgFl8eeGHBmpqr6MaHw9Yv6LJf1dn9oYx3VHOA/zsSTy1dCpG39f/5M9RwqxgERORoFoOGf4woVjqgdrpgI2K+XJ7fYw+Dub+KNG4RwzZJp4KGKgpHcDQwM2vTSYfrfxyqEgYTdLTEBtHNAUxSAI9YPBYJ9+5MVjYMnXLT91hTSPQC8dQxe3eFWcQoXewUAyPO4tRVgo+VvK3byOYNaIcnihA2X1xB3UACNjqrEWQA4Tv7i1PCGZ37mGIB5aUf1plQ9VB2OAwfya1lIBA4yyAaNygf1up/V/sm/s/q9oojX95GUwceqMQns4qRyjitiTnaxgXmcN3SgHo+VN9Cl/zaFN0L6NYYeJg8m1VB05pCNPrr/JzrnylFUNj9HnJTBBNATdg5Rv16zYMdtzb/upnELc2kqLxuFHLyB1a+etNUWwKSwS31zdQcd2VzHJ22reP8/cEet7S3oe2/wGWsRTq0GnBgDW0O3xhL21EY8H0DMn5Qqgh5ZJZgAdnUMY6nhqH2rE1ujKhBJmfFCgmSDCROmkyVKc9DDU4P8PoZ3EGHA6pcbexE2xtiusDX0DDl50wsTOPpoj9ilFyVQnOi3HQ78XQCcy2+sbOdDIW3iNM8Q3fHrJ1PA+9WiVSgkOOCqq0KiW1Yngs0BC/hgczhE67eAD1Fggt0tC/hgczhE67eAD1Fggt0tC/hgczhE67eAD1Fggt0tC/hgczhE6wfw/h/jCNFBWd3yyoE2AH/aazYrQ7hx4DSAx1/psyiyOFAN4Csja8zWaIE5gP/KYkXEcWADdufw+WgdJ1N78xHHuuE7YBwgzIPE4z832zR8x2H13EcOAOsmAA/6i/1i/RsBHBBYQ9WrtJlv5qsP1jUsOfAjj2oBRqZKPO5X4B+LwpoDDoztB9TsYz3JFxh6c8N66JE7uOd46K95Gj4mwnpOOHJqpfDhATCVhZwfXSmDX+ETVAv48OABsASmhggZLckf/sADQ8OgqzMDqmElJ0vyhycPgJ1X9a6C7e4K8x+unjUBhgcPgJVw2dyB6c+7ZVzoG069nKxJEFo8ACbABhgZIjmAY6gAZ4LLt5TTRZyKORUOphS+WhR8DuCPBmArHekkpw2c1nJC6N0w/R/pKLtSqeoMKAAAAABJRU5ErkJggg==',1,NULL,'2018-12-13 01:43:55','2018-12-13 01:43:55','http://uber-eats.sjv.io/c/1255071/347930/5162?subId1=USER_ID&sharedid=000_Dave.com','With Uber Eats, you can choose how you deliver. Depending on your city, you may be able to deliver food with your car, bike, or scooter. Between deliveries, it’s just you, so you can turn up the music and cruise around town.','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/ubereats.jpg','Uber Eats',NULL),(4,'Uber Driver Partner','Use your own car to give people rides','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',1,NULL,'2018-12-13 01:43:55','2018-12-13 01:43:55','http://uber.7eer.net/c/1255071/218769/3437?subId1=USER_ID&sharedid=000_Dave.com','Try driving with Uber—you use your own car to give people rides and you can get paid immediately to a debit card with Instant Pay up to five times per day.','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/uber.jpg','Uber',NULL),(5,'Lyft Driver','Lyft drivers needed. Get a $500 cash bonus','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',1,NULL,'2018-12-13 01:44:00','2018-12-13 01:44:00','https://click.linksynergy.com/fs-bin/click?id=AtUqVJQqHMM&offerid=609502.50&type=3&subid=0&u1=USER_ID','They\'ll ask for basic information about you and your car. If you don\'t have one, you can even rent one through them!','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/lyft.jpg','Lyft',NULL),(6,'Rover Pet Sitter','Earn $1,000/mo playing with dogs','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',1,NULL,'2018-12-13 01:44:00','2018-12-13 01:44:00','https://go.rover.com/dave/','Rover makes it easy and promotes you to the nation’s largest network of pet parents. Make up to $1,000/mo.','https://storage.googleapis.com/dave-images/images-production/emails/side-hustle/rover.jpg','Rover',NULL);

--
-- Table structure for table `subscription_billing`
--

DROP TABLE IF EXISTS `subscription_billing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_billing` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `start` datetime NOT NULL,
  `end` datetime NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  `billing_cycle` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `due_date` date DEFAULT NULL,
  `rewards_ledger_id` int(11) DEFAULT NULL,
  `referred_user_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id_billing_cycle_idx` (`user_id`,`start`,`end`),
  UNIQUE KEY `subscription_billing_billing_cyle_user_id_idx` (`billing_cycle`,`user_id`),
  KEY `subscription_billing_due_date` (`due_date`),
  KEY `subscription_billing_rewards_ledger_id_fk` (`rewards_ledger_id`),
  KEY `referred_user_id_fk` (`referred_user_id`),
  CONSTRAINT `referred_user_id_fk` FOREIGN KEY (`referred_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `subscription_billing_rewards_ledger_id_fk` FOREIGN KEY (`rewards_ledger_id`) REFERENCES `rewards_ledger` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `subsrciption_billing_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_billing`
--


--
-- Table structure for table `subscription_billing_promotion`
--

DROP TABLE IF EXISTS `subscription_billing_promotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_billing_promotion` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `months` int(11) NOT NULL,
  `deleted` datetime DEFAULT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_billing_promotion_code_unique` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_billing_promotion`
--

INSERT INTO `subscription_billing_promotion` VALUES (1,'Churn Prevention Months','CHURN_PREVENTION_MONTHS',3,NULL,'2020-03-31 23:33:25','2020-03-31 23:33:25'),(2,'Sweatcoin new user promotion','SWEATCOIN',2,NULL,'2020-03-31 23:33:26','2020-03-31 23:33:26');

--
-- Table structure for table `subscription_collection_attempt`
--

DROP TABLE IF EXISTS `subscription_collection_attempt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_collection_attempt` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_billing_id` int(11) NOT NULL,
  `trigger` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subscription_payment_id` int(11) DEFAULT NULL,
  `extra` json DEFAULT NULL,
  `processing` tinyint(1) DEFAULT '1',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_collection_attempt_billing_processing_unq_idx` (`subscription_billing_id`,`processing`),
  KEY `subscription_collection_attempt_subscription_payment_id` (`subscription_payment_id`),
  KEY `subscription_collection_attempt_trigger` (`trigger`),
  CONSTRAINT `subscription_attempt_billing_id_fk` FOREIGN KEY (`subscription_billing_id`) REFERENCES `subscription_billing` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_collection_attempt`
--


--
-- Table structure for table `subscription_payment`
--

DROP TABLE IF EXISTS `subscription_payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_payment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `bank_account_id` int(11) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `external_processor` enum('TABAPAY','SYNAPSEPAY','BANK_OF_DAVE','RISEPAY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','UNKNOWN','COMPLETED','RETURNED','CANCELED','CHARGEBACK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `payment_method_id` int(11) DEFAULT NULL,
  `webhook_data` json DEFAULT NULL,
  `reference_id` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_id` (`external_id`),
  UNIQUE KEY `external_id_2` (`external_id`),
  KEY `subscription_payment_user_id_fk` (`user_id`),
  KEY `subscription_payment_payment_method_id_fk` (`payment_method_id`),
  KEY `subscription_payment_bank_account_id_fk` (`bank_account_id`),
  KEY `subscription_payment_external_processor` (`external_processor`),
  KEY `subscription_payment_status` (`status`),
  KEY `subscription_payment_created` (`created`),
  KEY `subscription_payment_reference_id_idx` (`reference_id`),
  CONSTRAINT `subscription_payment_bank_account_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `subscription_payment_payment_method_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method` (`id`) ON UPDATE NO ACTION,
  CONSTRAINT `subscription_payment_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_payment`
--


--
-- Table structure for table `subscription_payment_line_item`
--

DROP TABLE IF EXISTS `subscription_payment_line_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscription_payment_line_item` (
  `subscription_billing_id` int(11) NOT NULL,
  `subscription_payment_id` int(11) NOT NULL,
  PRIMARY KEY (`subscription_billing_id`,`subscription_payment_id`),
  KEY `subscription_payment_line_item_payment_id_fk` (`subscription_payment_id`),
  CONSTRAINT `subscription_payment_line_item_billing_id_fk` FOREIGN KEY (`subscription_billing_id`) REFERENCES `subscription_billing` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `subscription_payment_line_item_payment_id_fk` FOREIGN KEY (`subscription_payment_id`) REFERENCES `subscription_payment` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subscription_payment_line_item`
--


--
-- Table structure for table `support_user_view`
--

DROP TABLE IF EXISTS `support_user_view`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `support_user_view` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `viewer_id` int(11) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `support_user_view_viewer_id_fk` (`viewer_id`),
  KEY `support_user_view_user_id_idx` (`user_id`),
  CONSTRAINT `support_user_view_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `support_user_view_viewer_id_fk` FOREIGN KEY (`viewer_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `support_user_view`
--


--
-- Table structure for table `synapsepay_document`
--

DROP TABLE IF EXISTS `synapsepay_document`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `synapsepay_document` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `synapsepay_user_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_notified` tinyint(1) NOT NULL DEFAULT '1',
  `email` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `day` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `month` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_street` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_subdivision` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_postal_code` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `permission` enum('UNVERIFIED','SEND-AND-RECEIVE','LOCKED','MAKE-IT-GO-AWAY','CLOSED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ssn_status` enum('REVIEWING','VALID','INVALID','BLACKLIST') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssn` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license` mediumblob,
  `license_status` enum('REVIEWING','VALID','INVALID') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `synapsepay_doc_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  `sanctions_screening_match` tinyint(1) NOT NULL DEFAULT '0',
  `watchlists` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `flag` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `flag_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `permission_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `synapsepay_user_id` (`synapsepay_user_id`),
  KEY `synapsepay_document_user_id_fk` (`user_id`),
  KEY `synapsepay_document_sanctions_screening_match_idx` (`sanctions_screening_match`),
  KEY `synapsepay_document_watchlists_index` (`watchlists`),
  KEY `synapsepay_document_flag_index` (`flag`),
  KEY `synapsepay_document_flag_code_index` (`flag_code`),
  KEY `synapsepay_document_permission_code_index` (`permission_code`),
  CONSTRAINT `synapsepay_document_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `synapsepay_document`
--


--
-- Table structure for table `tabapay_key`
--

DROP TABLE IF EXISTS `tabapay_key`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tabapay_key` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `key` varchar(4096) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` datetime NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tabapay_key`
--

DROP TABLE IF EXISTS `third_party_name`;	
/*!40101 SET @saved_cs_client     = @@character_set_client */;	
/*!50503 SET character_set_client = utf8mb4 */;	
CREATE TABLE `third_party_name` (	
  `id` int(11) NOT NULL AUTO_INCREMENT,	
  `user_id` int(11) NOT NULL,	
  `first_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,	
  `last_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,	
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,	
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,	
  PRIMARY KEY (`id`),	
  KEY `third_party_name_user_id_fk` (`user_id`),	
  CONSTRAINT `third_party_name_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION	
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;	
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `transaction_settlement`
--

DROP TABLE IF EXISTS `transaction_settlement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_settlement` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `external_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('DISBURSEMENT','PAYMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','ERROR','COMPLETED','CANCELED','REPRESENTMENT','CHARGEBACK') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(16,2) NOT NULL,
  `representment_start` datetime DEFAULT NULL,
  `representment_end` datetime DEFAULT NULL,
  `modifications` json DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed` datetime DEFAULT NULL,
  `source_id` int(11) DEFAULT NULL,
  `source_type` enum('PAYMENT','SUBSCRIPTION_PAYMENT','ADVANCE') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processor` enum('TABAPAY','RISEPAY','SYNAPSEPAY','BLASTPAY') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `raw` json DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_four` varchar(4) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `source_id_source_type` (`source_id`,`source_type`),
  UNIQUE KEY `external_id_processor` (`external_id`,`processor`),
  KEY `tabapay_transaction_status` (`status`),
  KEY `tabapay_transaction_type` (`type`),
  KEY `full_name_idx` (`full_name`),
  KEY `last_four_idx` (`last_four`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_settlement`
--


--
-- Table structure for table `transaction_settlement_processed_file`
--

DROP TABLE IF EXISTS `transaction_settlement_processed_file`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction_settlement_processed_file` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rows_processed` int(11) NOT NULL,
  `process_time_seconds` int(11) NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_name` (`file_name`),
  KEY `transaction_settlement_processed_file_filename_idx` (`file_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_settlement_processed_file`
--


--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `legacy_id` int(11) DEFAULT NULL,
  `phone_number` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `synapsepay_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risepay_customer_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risepay_address_id` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settings` json NOT NULL,
  `birthdate` date DEFAULT NULL,
  `address_line1` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line2` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zip_code` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssn` varchar(265) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pin` varchar(265) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_subscribed` tinyint(1) NOT NULL DEFAULT '1',
  `subscription_start` date DEFAULT NULL,
  `subscription_fee` decimal(16,2) NOT NULL DEFAULT '1.00',
  `default_bank_account_id` int(11) DEFAULT NULL,
  `underwriting_override` json DEFAULT NULL,
  `deleted` datetime NOT NULL DEFAULT '9999-12-31 23:59:59',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `gender` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_image` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fcm_token` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `last_active` datetime DEFAULT NULL,
  `allow_duplicate_card` tinyint(1) NOT NULL DEFAULT '0',
  `fraud` tinyint(1) NOT NULL DEFAULT '0',
  `unsubscribed` tinyint(1) NOT NULL DEFAULT '0',
  `bypass_ml` tinyint(1) NOT NULL DEFAULT '0',
  `used_two_months_free` datetime DEFAULT NULL,
  `override_sixty_day_delete` tinyint(1) NOT NULL DEFAULT '0',
  `lower_email` varchar(256) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (lower(`email`)) VIRTUAL,
  `lower_first_name` varchar(256) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (lower(`first_name`)) VIRTUAL,
  `lower_last_name` varchar(256) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (lower(`last_name`)) VIRTUAL,
  `lower_full_name` varchar(513) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (concat_ws(' ',lower(`first_name`),lower(`last_name`))) VIRTUAL,
  `license_image` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `secondary_email` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `empyr_user_id` int(11) DEFAULT NULL,
  `password` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mx_user_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone_number` (`phone_number`),
  UNIQUE KEY `legacy_id` (`legacy_id`),
  UNIQUE KEY `synapsepay_id` (`synapsepay_id`),
  UNIQUE KEY `risepay_customer_id` (`risepay_customer_id`),
  UNIQUE KEY `risepay_address_id` (`risepay_address_id`),
  UNIQUE KEY `active_user_email_idx` (`email`,`deleted`),
  UNIQUE KEY `mx_user_id` (`mx_user_id`),
  KEY `user_email_idx` (`email`),
  KEY `user_empyr_user_id_idx` (`empyr_user_id`),
  KEY `user_birthdate_idx` (`birthdate`),
  KEY `lower_email` (`lower_email`),
  KEY `lower_first_name` (`lower_first_name`),
  KEY `lower_last_name` (`lower_last_name`),
  KEY `lower_full_name` (`lower_full_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--


--
-- Table structure for table `user_app_version`
--

DROP TABLE IF EXISTS `user_app_version`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_app_version` (
  `user_id` int(11) NOT NULL,
  `app_version` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`app_version`,`device_type`),
  KEY `user_app_version_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_app_version`
--


--
-- Table structure for table `user_feedback`
--

DROP TABLE IF EXISTS `user_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_feedback` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `feedback` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `context` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_feedback_user_id_fk` (`user_id`),
  CONSTRAINT `user_feedback_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_feedback`
--


--
-- Table structure for table `user_incident`
--

DROP TABLE IF EXISTS `user_incident`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_incident` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `incident_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_incident_user_incident_idx` (`incident_id`,`user_id`),
  KEY `user_incident_user_id_fk` (`user_id`),
  CONSTRAINT `user_incident_incident_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `incident` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `user_incident_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_incident`
--


--
-- Table structure for table `user_ip_address`
--

DROP TABLE IF EXISTS `user_ip_address`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_ip_address` (
  `user_id` int(11) NOT NULL,
  `ip_address` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`ip_address`),
  KEY `user_ip_address_ip_address_idx` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_ip_address`
--


--
-- Table structure for table `user_notification`
--

DROP TABLE IF EXISTS `user_notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_notification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `notification_id` int(11) DEFAULT NULL,
  `sms_enabled` tinyint(1) DEFAULT '0',
  `push_enabled` tinyint(1) DEFAULT '0',
  `email_enabled` tinyint(1) DEFAULT '0',
  `threshold` int(11) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_notification_user_id_notification_id_idx` (`user_id`,`notification_id`),
  KEY `user_notification_notification_id_fk` (`notification_id`),
  CONSTRAINT `user_notification_notification_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `notification` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `user_notification_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_notification`
--


--
-- Table structure for table `user_role`
--

DROP TABLE IF EXISTS `user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_role` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `role_id` int(11) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_role_user_id_fk` (`user_id`),
  KEY `user_role_role_id_fk` (`role_id`),
  CONSTRAINT `user_role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `user_role_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_role`
--


--
-- Table structure for table `user_session`
--

DROP TABLE IF EXISTS `user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_session` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int(11) NOT NULL,
  `device_id` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_type` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `synapsepay_refresh_token` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idfa` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_login_override` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_session_user_id_fk` (`user_id`),
  KEY `user_session_device_id_token_idx` (`device_id`,`token`),
  KEY `user_session_idfa_idx` (`idfa`),
  KEY `admin_login_override_idx` (`admin_login_override`),
  CONSTRAINT `user_session_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_session`
--


--
-- Table structure for table `user_setting`
--

DROP TABLE IF EXISTS `user_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_setting` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_setting_name_id` int(10) unsigned NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_setting_user_id_fk` (`user_id`),
  KEY `user_setting_name_id_fk` (`user_setting_name_id`),
  KEY `user_setting_value_index` (`value`),
  CONSTRAINT `user_setting_name_id_fk` FOREIGN KEY (`user_setting_name_id`) REFERENCES `user_setting_name` (`id`),
  CONSTRAINT `user_setting_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_setting`
--


--
-- Table structure for table `user_setting_name`
--

DROP TABLE IF EXISTS `user_setting_name`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_setting_name` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_setting_name_name_unique` (`name`),
  KEY `user_setting_name_name_index` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_setting_name`
--

INSERT INTO `user_setting_name` VALUES (1,'locale');


SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;

-- Dump completed on 2020-04-29 14:24:36
