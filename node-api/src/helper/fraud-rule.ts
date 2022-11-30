import * as Bluebird from 'bluebird';
import { NotFoundError } from '../lib/error';
import { moment } from '@dave-inc/time-lib';
import { shallowMungeObjToCase, toE164 } from '../lib/utils';
import { dogstatsd } from '../lib/datadog-statsd';
import { Op, QueryTypes, Transaction, WhereAttributeHash } from 'sequelize';
import { FraudAlert, FraudRule, User, sequelize } from '../models';

export const FraudRuleAttrs = [
  'email',
  'phoneNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zipCode',
  'firstName',
  'lastName',
  'birthdate',
] as const;

export type Rule = {
  [key in typeof FraudRuleAttrs[number]]?: string;
};

export type CreatedRuleResult = {
  createdRule: FraudRule;
  affectedUsers: User[];
};

function generateFraudAlert(userId: number, fraudRule: FraudRule, isNewFraudRule: boolean) {
  const reason = isNewFraudRule
    ? 'user matched newly created fraud rule'
    : 'user create or update matched existing fraud rule';
  return {
    userId,
    reason,
    /* storing fraud rule obj in extra field for ease of displaying,
     * but wouldn't it be better to just join on fraud rule table
     * and use that as source of truth?
     */
    extra: fraudRule,
    fraudRuleId: fraudRule.id,
  };
}

export async function handleFraudulentUser(
  user: User,
  existingAlert: FraudAlert,
  fraudRule: FraudRule,
  transaction: Transaction = null,
): Promise<void> {
  if (!existingAlert) {
    // create an alert for a user if they match the rule but haven't been flagged yet
    await FraudAlert.create(generateFraudAlert(user.id, fraudRule, false), { transaction });
  } else {
    await existingAlert.update({ resolved: null, extra: fraudRule }, { transaction });
  }
  dogstatsd.increment('fraud_rule.user_marked_as_fraud_due_to_user_update_or_fr_update');
  await user.update({ fraud: true }, { transaction });
}

async function resolveFraudulentUser(
  user: User,
  existingAlert: FraudAlert,
  fraudRule: FraudRule,
  transaction: Transaction,
): Promise<void> {
  if (existingAlert) {
    await existingAlert.update(
      {
        resolved: moment().format('MM-DD-YYYY HH:mm:ss'),
        extra: {
          reason: `Resolved because rule marked as inactive on ${moment().format(
            'YYYY-MM-DD HH:mm:ss',
          )}`,
        },
      },
      { transaction },
    );
  }
  if (!(await userHasOtherActiveFraudAlerts(user.id, fraudRule.id, transaction))) {
    dogstatsd.increment('fraud_rule.user_fraud_resolved');
    await user.update({ fraud: false }, { transaction });
  }
}

async function userHasOtherActiveFraudAlerts(
  userId: number,
  fraudRuleId: number,
  transaction: Transaction,
): Promise<boolean> {
  const otherFraudAlerts: FraudAlert[] = await FraudAlert.findAll({
    where: {
      resolved: null,
      userId,
      fraudRuleId: { [Op.not]: fraudRuleId },
    },
    transaction,
  });
  return otherFraudAlerts && otherFraudAlerts.length > 0;
}

async function createFraudAlertsForAffectedUsers(
  sanitizedRule: WhereAttributeHash,
  newFraudRule: FraudRule,
  transaction: Transaction,
): Promise<User[]> {
  const userMatches = await User.findAll({ where: sanitizedRule, transaction });
  const userFraudAlerts = userMatches.map(user => {
    dogstatsd.increment('fraud_rule.user_marked_as_fraud_due_to_fr_create');
    return generateFraudAlert(user.id, newFraudRule, true);
  });
  await FraudAlert.bulkCreate(userFraudAlerts, { transaction });
  await User.update(
    { fraud: true },
    {
      where: {
        id: userMatches.map(user => user.id),
      },
      transaction,
    },
  );
  return userMatches;
}

export async function fraudRuleExists(
  rule: WhereAttributeHash,
  transaction: Transaction,
): Promise<boolean> {
  const where: WhereAttributeHash = {};
  const sanitizedRule = formatForFraudRule(rule);
  FraudRuleAttrs.forEach((attr: keyof Partial<FraudRule>) => {
    where[attr] = sanitizedRule[attr] || null;
  });
  const existingRule = await FraudRule.findOne({ where, transaction });
  return Boolean(existingRule);
}

export function formatForFraudRule(rule: Rule): WhereAttributeHash {
  const rules: WhereAttributeHash = {};
  Object.keys(rule).forEach((key: typeof FraudRuleAttrs[number]) => {
    if (FraudRuleAttrs.includes(key)) {
      if (rule[key] === null) {
        rule[key] = null as never;
      } else if (key === 'phoneNumber') {
        rules[key] = toE164(rule[key]);
      } else if (key === 'birthdate') {
        rules[key] = moment(rule[key]).format('YYYY-MM-DD');
      } else {
        rules[key] = rule[key];
      }
    }
  });
  return rules;
}

export function formatForUserQuery(rule: Rule) {
  const rules: WhereAttributeHash = {};
  Object.keys(rule).forEach((key: typeof FraudRuleAttrs[number]) => {
    if (FraudRuleAttrs.includes(key)) {
      if (rule[key] === null) {
        rule[key] = null as never;
      } else if (key === 'firstName') {
        rules.lowerFirstName = rule[key];
      } else if (key === 'lastName') {
        rules.lowerLastName = rule[key];
      } else if (key === 'email') {
        rules.lowerEmail = rule[key];
      } else if (key === 'phoneNumber') {
        rules[key] = toE164(rule[key]);
      } else if (key === 'birthdate') {
        rules[key] = moment(rule[key]).format('YYYY-MM-DD');
      } else {
        rules[key] = rule[key];
      }
    }
  });
  return rules;
}

export function updateAffectedUsersAndFraudAlerts(
  users: User[],
  fraudRule: FraudRule,
  isFraudRuleActive: boolean,
  transaction: Transaction,
): Bluebird<User[]> {
  return Bluebird.each(users, async (user: User) => {
    const existingAlert: FraudAlert = await FraudAlert.findOne({
      where: {
        userId: user.id,
        fraudRuleId: fraudRule.id,
      },
      transaction,
    });
    if (isFraudRuleActive) {
      await handleFraudulentUser(user, existingAlert, fraudRule, transaction);
    } else {
      await resolveFraudulentUser(user, existingAlert, fraudRule, transaction);
    }
  });
}

export async function previewAffectedUsers(
  rules: Rule[],
  options: Bluebird.ConcurrencyOption = { concurrency: 10 },
): Promise<User[]> {
  const allMatches: { [key: number]: User } = {};
  await Bluebird.map(
    rules,
    async rule => {
      const sanitizedRule = formatForUserQuery(rule);
      const userMatches = await User.findAll({ where: sanitizedRule });
      userMatches.forEach(match => {
        if (!allMatches[match.id]) {
          allMatches[match.id] = match;
        }
      });
    },
    options,
  );
  return Object.values(allMatches);
}

export async function updateFraudRule(
  isActive: boolean,
  fraudRuleId: number,
  updatingUserId: number,
): Promise<void> {
  const fraudRule = await FraudRule.findByPk(fraudRuleId);
  if (!fraudRule) {
    throw new NotFoundError('Fraud Rule Not Found');
  }
  await sequelize.transaction(async trx => {
    const attrs = { isActive, updatedByUserId: updatingUserId };
    await fraudRule.update(attrs, { transaction: trx });
    const userMatches = await User.getByFraudRuleId(fraudRuleId, trx);
    await updateAffectedUsersAndFraudAlerts(userMatches, fraudRule, isActive, trx);
  });
}

export async function createFraudRuleHelper(
  rule: Rule,
  trx: Transaction,
  internalUserId: number,
): Promise<CreatedRuleResult> {
  if (!(await fraudRuleExists(rule, trx))) {
    const sanitizedRule = formatForFraudRule(rule);
    const newFraudRule = await FraudRule.create(
      {
        ...sanitizedRule,
        createdByUserId: internalUserId,
      },
      { transaction: trx },
    );
    const affectedUsers = await createFraudAlertsForAffectedUsers(
      formatForUserQuery(rule),
      newFraudRule,
      trx,
    );
    return {
      createdRule: newFraudRule,
      affectedUsers,
    };
  } else {
    return null;
  }
}

export async function handleCreateFraudRules(
  rules: Rule[],
  internalUserId: number,
): Promise<{ status: string; duplicates: Rule[] }> {
  const duplicates: Rule[] = [];
  let hasAtLeastOneNewRule = false;
  await sequelize.transaction(async trx => {
    await Bluebird.each(rules, async rule => {
      const createResult = await createFraudRuleHelper(rule, trx, internalUserId);
      if (!createResult) {
        duplicates.push(rule);
      } else {
        hasAtLeastOneNewRule = true;
      }
    });
  });
  const status = hasAtLeastOneNewRule ? 'ok' : 'All rules provided already exist';
  return { status, duplicates };
}

export async function searchFraudRulesBySearchTerm(searchTerm: string): Promise<FraudRule[]> {
  const digits = searchTerm.replace(/\D/g, '');
  const formattedDate = moment(searchTerm).isValid()
    ? moment(searchTerm).format('YYYY-MM-DD')
    : searchTerm;

  const query = `
    SELECT *
    FROM fraud_rule fr
    WHERE ( fr.phone_number = CONCAT('+1',?))
    OR fr.phone_number = CONCAT('+',?)
    OR fr.phone_number LIKE CONCAT(?,'-deleted%')
    OR fr.phone_number LIKE CONCAT('1',?,'-deleted%')
    OR fr.phone_number LIKE CONCAT('+1',?,'-deleted%')
    OR fr.phone_number LIKE CONCAT('+',?,'-deleted%')
    OR fr.phone_number = ?
    OR LOWER(fr.email) = LOWER(?)
    OR CONCAT_WS(' ', LOWER(fr.first_name), LOWER(fr.last_name)) = LOWER(?)
    OR LOWER(fr.address_line_1) = LOWER(?)
    OR LOWER(fr.address_line_2) = LOWER(?)
    OR CONCAT_WS(' ', LOWER(fr.address_line_1), LOWER(fr.address_line_2)) = LOWER(?)
    OR LOWER(fr.city) = LOWER(?)
    OR LOWER(fr.state) = LOWER(?)
    OR fr.zip_code = ?
    OR LOWER(fr.first_name) = LOWER(?)
    OR LOWER(fr.last_name) = LOWER(?)
    OR fr.birthdate = ?
  `;

  const results = await sequelize.query(query, {
    replacements: [
      digits,
      digits,
      digits,
      digits,
      digits,
      digits,
      digits,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      formattedDate,
    ],
    type: QueryTypes.SELECT,
  });

  return results.map((row: any) => {
    return FraudRule.build(shallowMungeObjToCase(row, 'camelCase'));
  });
}
