import { MOMENT_FORMATS } from '@dave-inc/time-lib';
import { toLower } from 'lodash';
import { PerformFraudCheckPayload } from '../data';
import { FraudAlert, FraudRule, User } from '../../models';
import { FraudRuleAttrs, handleFraudulentUser } from '../../helper/fraud-rule';
import { dogstatsd } from '../../lib/datadog-statsd';
import { serializeDate } from '../../serialization';
import { sequelize } from '../../models';

export async function performFraudCheck(data: PerformFraudCheckPayload): Promise<void> {
  dogstatsd.increment('fraud_rule.check_user_for_fraud_task_started');
  await checkUserForFraud(data.userId);
  dogstatsd.increment('fraud_rule.check_user_for_fraud_task_completed');
}

async function getUserFraudRules(user: User): Promise<FraudRule[]> {
  const { lowerLastName, lowerFirstName, phoneNumber, lowerEmail, addressLine1, zipCode } = user;

  return sequelize.query(
    `
    SELECT *
    FROM fraud_rule
    WHERE
      lower(first_name) = :lowerFirstName AND
      lower(last_name) = :lowerLastName AND
      lower(first_name) IS NOT NULL AND
      lower(last_name) IS NOT NULL AND
      is_active = true
    UNION
    SELECT *
    FROM fraud_rule
    WHERE
      phone_number = :phoneNumber AND
      phone_number IS NOT NULL AND
      is_active = true
    UNION
    SELECT *
    FROM fraud_rule
    WHERE
      lower(email) = :lowerEmail AND
      lower(email) IS NOT NULL AND
      is_active = true
    UNION
    SELECT *
    FROM fraud_rule
    WHERE
      zip_code = :zipCode AND
      zip_code IS NOT NULL AND
      lower(address_line_1) = :lowerAddressLine1 AND
      lower(address_line_1) IS NOT NULL AND
      is_active = true;
  `,
    {
      replacements: {
        lowerLastName,
        lowerFirstName,
        phoneNumber,
        lowerEmail,
        lowerAddressLine1: toLower(addressLine1),
        zipCode,
      },
      model: FraudRule,
      mapToModel: true,
    },
  );
}

async function checkUserForFraud(userId: number): Promise<void> {
  const user: User = await User.findByPk(userId);
  if (!user) {
    return;
  }

  const fraudRules = await getUserFraudRules(user);

  await Promise.all(fraudRules.map((rule: FraudRule) => checkAndHandleRuleUserMatch(rule, user)));
}

async function checkAndHandleRuleUserMatch(rule: FraudRule, user: User) {
  if (userMatchesFraudRule(user, rule)) {
    const existingAlert = await FraudAlert.findOne({
      where: {
        userId: user.id,
        fraudRuleId: rule.id,
      },
    });
    await handleFraudulentUser(user, existingAlert, rule, null);
  }
}

function userMatchesFraudRule(user: User, fraudRule: FraudRule) {
  // all conditions of a given rule have to be met.
  const matchFields = getPossibleMatchFields(fraudRule);
  return matchFields.every(column => {
    if (column === 'birthdate') {
      return (
        serializeDate(user.getDataValue(column), MOMENT_FORMATS.YEAR_MONTH_DAY) ===
        serializeDate(fraudRule.getDataValue(column), MOMENT_FORMATS.YEAR_MONTH_DAY)
      );
    }

    return toLower(user.getDataValue(column)) === toLower(fraudRule.getDataValue(column));
  });
}

function getPossibleMatchFields(fraudRule: FraudRule) {
  return FraudRuleAttrs.filter(attr => fraudRule[attr] !== null);
}
