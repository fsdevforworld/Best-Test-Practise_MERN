import { RequestHandler } from 'express';
import * as multer from 'multer';

const multipleFileOpts = {
  limits: {
    fileSize: 2 ** 25,
  },
};

const middlewareMultipleFiles: RequestHandler = multer(multipleFileOpts).array('files');

export default middlewareMultipleFiles;
