import { RequestHandler } from 'express';
import * as multer from 'multer';

const multerOpts = {
  limits: {
    files: 1,
    fileSize: 2 ** 25,
  },
};

export const multerFieldName = 'image';

const middleware: RequestHandler = multer(multerOpts).single(multerFieldName);

export default middleware;
