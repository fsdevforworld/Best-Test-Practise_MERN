import * as PromiseRouter from 'express-promise-router';
import createNote from './create-note';
import getNotes from './get-notes';

const router = PromiseRouter();

router.get('/', getNotes);

router.post('/', createNote);

export default router;
