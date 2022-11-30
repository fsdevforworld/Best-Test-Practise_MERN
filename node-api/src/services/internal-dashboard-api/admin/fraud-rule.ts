import { Response } from 'express';
import { getParams } from '../../../lib/utils';

import { FraudRule } from '../../../models';
import { NotFoundError } from '../../../lib/error';
import {
  searchFraudRulesBySearchTerm,
  updateFraudRule,
  handleCreateFraudRules,
  previewAffectedUsers,
  Rule,
} from '../../../helper/fraud-rule';
import { IDashboardApiRequest } from '../../../typings';

/**
 *
 * ROUTE HANDLERS
 *
 */

async function preview(req: IDashboardApiRequest, res: Response): Promise<void> {
  const rules: Rule[] = JSON.parse(req.query.rules);
  const allMatches = await previewAffectedUsers(rules);
  res.send({ status: 'ok', data: allMatches });
}

async function create(req: IDashboardApiRequest, res: Response): Promise<void> {
  const { rules }: { rules: Rule[] } = getParams(req.body, ['rules']);
  const { status, duplicates } = await handleCreateFraudRules(rules, req.internalUser.id);
  res.send({ status, duplicates });
}

async function getById(req: IDashboardApiRequest, res: Response): Promise<void> {
  let response: any = {};
  const fraudRule = await FraudRule.findByPk(req.params.id);
  if (!fraudRule) {
    throw new NotFoundError('Fraud rule Not Found ');
  }
  response = fraudRule;

  res.send(response);
}

async function update(
  req: IDashboardApiRequest<{ active: boolean }>,
  res: Response,
): Promise<void> {
  const { active: isActive } = getParams(req.body, ['active']);
  const fraudRuleId: number = req.params.id;
  await updateFraudRule(isActive, fraudRuleId, req.internalUser.id);
  res.send({ status: 'ok' });
}

async function search(req: IDashboardApiRequest, res: Response) {
  const { searchTerm }: { searchTerm: string } = getParams(req.query, ['searchTerm']);
  const results = await searchFraudRulesBySearchTerm(searchTerm);
  res.send({ status: 'ok', results });
}

export default {
  create,
  getById,
  preview,
  update,
  search,
};
