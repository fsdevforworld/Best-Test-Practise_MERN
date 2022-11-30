import { checkIfEmailIsDuplicate } from '../../../../helper/user';
import { InvalidParametersError } from '../../../../lib/error';
import { sendEmail } from '../../../../helper/email-verification';
import { getParams, validateEmail } from '../../../../lib/utils';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionLogEmailVerification,
  DashboardActionReason,
  EmailVerification,
  InternalUser,
  sequelize,
  User,
} from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { userSerializers } from '../../serializers';
import { ActionCode, validateActionLog } from '../../domain/action-log';

async function createEmailVerification(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<userSerializers.IEmailVerificationResource>,
) {
  const user = req.resource;
  const internalUserId = req.internalUser.id;
  const { email, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['email', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  const [isValidEmail] = await Promise.all([
    validateEmail(email),
    checkIfEmailIsDuplicate(email, user.id),
    validateActionLog(dashboardActionReasonId, ActionCode.CreateEmailVerification, note),
  ]);

  if (!isValidEmail) {
    throw new InvalidParametersError('Invalid email: email is incorrectly formatted');
  }

  const oldEmail = user.email;

  const [emailVerification, dashboardEmailVerification] = await sequelize.transaction(
    async transaction => {
      const [createdEmailVerification, dashboardActionLog] = await Promise.all([
        EmailVerification.create({ userId: user.id, email }, { transaction }),
        DashboardActionLog.create(
          {
            dashboardActionReasonId,
            internalUserId,
            zendeskTicketUrl,
            note,
          },
          { transaction },
        ),
      ]);

      const createdDashboardEmailVerification = await DashboardActionLogEmailVerification.create(
        {
          emailVerificationId: createdEmailVerification.id,
          dashboardActionLogId: dashboardActionLog.id,
        },
        { transaction },
      );

      return [createdEmailVerification, createdDashboardEmailVerification];
    },
  );

  await Promise.all([
    sendEmail(user.id, emailVerification.id, email, oldEmail),
    dashboardEmailVerification.reload({
      include: [
        EmailVerification,
        {
          model: DashboardActionLog,
          include: [
            {
              model: DashboardActionReason,
              include: [DashboardAction],
            },
            InternalUser,
          ],
        },
      ],
    }),
  ]);

  const serializedEmailVerification = await userSerializers.serializeEmailVerification(
    emailVerification,
  );

  const response = {
    data: serializedEmailVerification,
  };

  return res.send(response);
}

export default createEmailVerification;
