import { Router } from 'express';
import * as PromiseRouter from 'express-promise-router';

import { ping, webhook } from './controller';
import { validateBasicAuth } from './middleware';

const mxRouter: Router = PromiseRouter();

mxRouter.get('/ping', ping);

mxRouter.post('/', validateBasicAuth, webhook);

export default mxRouter;
