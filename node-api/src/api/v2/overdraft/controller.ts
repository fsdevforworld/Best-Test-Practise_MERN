import * as AdvanceController from '../advance/controller';

async function upload(screenshotContents: Express.Multer.File, userId: number): Promise<string> {
  const isOverdraft = true;
  return AdvanceController.uploadScreenshot(screenshotContents, userId, isOverdraft);
}

export default {
  upload,
};
