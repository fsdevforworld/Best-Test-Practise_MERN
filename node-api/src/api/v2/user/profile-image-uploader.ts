import gcloudStorage from '../../../lib/gcloud-storage';
import * as uuid from 'uuid';
import logger from '../../../lib/logger';

const USER_PROFILE_IMAGE_DIRECTORY = 'user-profile-images';

export const uploadUserProfileImage = async (
  profileImage: string | Express.Multer.File,
): Promise<string> => {
  try {
    const uniqueProfilePictureId = uuid.v4();
    const uploadedImageURL = await gcloudStorage.saveImageToGCloud(
      profileImage,
      USER_PROFILE_IMAGE_DIRECTORY,
      uniqueProfilePictureId,
    );
    return uploadedImageURL;
  } catch (ex) {
    logger.error("Failed to upload user's profile image!", ex);
    throw ex;
  }
};
