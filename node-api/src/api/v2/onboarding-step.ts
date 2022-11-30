import { InvalidParametersError } from '../../lib/error';
import { fn, col } from 'sequelize';

import { OnboardingStep, User } from '../../models';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { Response } from 'express';
import logger from '../../lib/logger';

async function get(req: IDaveRequest, res: IDaveResponse<string[]>): Promise<Response> {
  const steps = await OnboardingStep.unscoped().findAll({
    where: { userId: req.user.id },
    attributes: [[fn('DISTINCT', col('step')), 'step']],
  });

  return res.send(steps.map(step => step.step));
}

async function create(req: IDaveRequest, res: IDaveResponse<string[]>): Promise<Response> {
  const { step } = req.body;

  if (!step) {
    throw new InvalidParametersError(null, {
      required: ['step'],
      provided: [],
    });
  }

  await OnboardingStep.findOrCreate({ where: { userId: req.user.id, step } });

  // temp solution to have users skip debit card step if payment method already exists
  if (step === 'SelectAccount') {
    try {
      const user = await User.findByPk(req.user.id);
      const defaultAcc = await user.getDefaultBankAccount();
      const paymentMethod = await defaultAcc?.getDefaultPaymentMethod();
      if (paymentMethod) {
        await OnboardingStep.findOrCreate({ where: { userId: req.user.id, step: 'AddDebitCard' } });
      }
    } catch (error) {
      logger.error('Error skipping payment method step.', {
        error,
        userId: req.user.id,
        requestId: req.get('X-Request-Id'),
      });
    }
  }

  return get(req, res);
}

async function remove(req: IDaveRequest, res: IDaveResponse<string[]>) {
  const userId = req.user.id;
  const stepsToRemove = req.body.steps || [];

  const stepsRemaining = await OnboardingStep.removeSteps(userId, stepsToRemove);

  res.send(stepsRemaining.map(step => step.step));
}

export default { get, create, remove };
