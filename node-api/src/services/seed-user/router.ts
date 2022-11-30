import { Router } from 'express';
import { seedUsers, patchUser, postBalanceLogs } from './controller';
import * as PromiseRouter from 'express-promise-router';

const seedUserRouter: Router = PromiseRouter();

seedUserRouter.post('/seed', seedUsers);
seedUserRouter.patch('/user/:id', patchUser);
seedUserRouter.post('/daily-balance-logs', postBalanceLogs);

export default seedUserRouter;
