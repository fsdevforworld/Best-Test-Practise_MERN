import * as Bluebird from 'bluebird';
import SideHustleApplicationHelper from '../../helper/side-hustle-application';
import { SideHustleApplication, SideHustleJob, User } from '../../models';
import { Status } from '../../models/side-hustle-application';
import { isTestEnv } from '../../lib/utils';
import { SideHustleNotificationsData } from '../data';

export async function sideHustleNotifications({
  applicationIds,
  userId,
}: SideHustleNotificationsData): Promise<void> {
  const user = await User.findByPk(userId, { paranoid: false });

  const applicationsWithJobs = await SideHustleApplication.findAll({
    attributes: ['id'],
    where: { id: applicationIds },
    include: [SideHustleJob],
  });

  if (user.email) {
    await SideHustleApplicationHelper.sendSideHustleEmail(
      applicationsWithJobs,
      user.id,
      user.firstName,
      user.email,
    );
  }

  await SideHustleApplicationHelper.sendIntroSMS(user.firstName, user.phoneNumber);

  // 15-second delay to guarantee intro sms message is sent before affiliate links
  if (!isTestEnv()) {
    const delay = 15000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  await SideHustleApplicationHelper.sendAffiliatesSMS(
    applicationsWithJobs,
    user.id,
    user.phoneNumber,
  );

  await Bluebird.each(applicationsWithJobs, application => {
    return application.update({ status: Status.CONTACTED });
  });
}
