import { NotSupportedError } from '@dave-inc/error-types';
import * as PromiseRouter from 'express-promise-router';
import { BankAccount } from '../../../../../models';
import { IDashboardApiResourceRequest } from '../../../../../typings';
import download from './download';
import getMonthlyStatements from './get-monthly-statements';

const router = PromiseRouter();

router.use(async (req: IDashboardApiResourceRequest<BankAccount>, res, next) => {
  const { resource: bankAccount } = req;
  const isDaveBanking = await bankAccount.isDaveBanking();

  if (isDaveBanking) {
    return next();
  }

  throw new NotSupportedError('Statements only available for Dave Banking accounts');
});

router.get('/', getMonthlyStatements);
router.post('/:statementId/download', download);

export default router;
