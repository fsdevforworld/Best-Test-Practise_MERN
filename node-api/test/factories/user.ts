// Important: If we chang things here, we should make sure the seeds are still working properly
import * as Bluebird from 'bluebird';
import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { Role, User } from '../../src/models';
import { UserRole as RoleName } from '@dave-inc/wire-typings';

export interface IUserBuildOptions {
  hasAppVersion?: boolean;
  hasSession?: boolean;
  hasEmailVerification?: boolean;
  roles?: RoleName[];
  deviceId?: string;
}

const options = (factory: any) => ({
  afterCreate: async (model: any, attrs: any, buildOptions: IUserBuildOptions) => {
    if (buildOptions.hasSession !== false) {
      const deviceId = buildOptions.deviceId || model.id;
      await factory.create('user-session', {
        userId: model.id,
        deviceId,
        token: model.id,
      });
    }

    if (buildOptions.hasAppVersion !== false) {
      await factory.create('user-app-version', {
        userId: model.id,
      });
    }

    if (buildOptions.hasEmailVerification) {
      const emailProps: any = { userId: model.id };
      if (attrs.email) {
        emailProps.email = attrs.email;
      }
      await factory.create('email-verification', emailProps);
    }

    if (buildOptions.roles) {
      const roles = await Role.findAll({ where: { name: buildOptions.roles } });
      await Bluebird.map(roles, role => model.addRole(role));
    }

    return model;
  },

  afterBuild: async (model: any, attrs: any, buildOptions: IUserBuildOptions) => {
    if (model.email && model.emailVerified === false) {
      // Enforce email not being set when emailVerified is false
      model.email = null;
    } else if (model.email) {
      // Enforce emailVerified being true if there is an email set
      model.emailVerified = true;
    }

    return model;
  },
});

export default function(factory: any) {
  factory.define(
    'user',
    User,
    {
      phoneNumber: () => Faker.phone.phoneNumber('+1##########'),
      mxUserId: null,
      synapsepayId: () => Faker.random.uuid(),
      deleted: '9999-12-31 23:59:59',
      firstName: Faker.name.firstName(),
      lastName: Faker.name.lastName(),
    },
    options(factory),
  );

  factory.extend(
    'user',
    'new-user',
    {
      synapsepayId: null,
      firstName: null,
      lastName: null,
    },
    options(factory),
  );

  factory.extend(
    'user',
    'subscribed-user',
    {
      subscriptionStart: () =>
        moment()
          .subtract(1, 'month')
          .format('YYYY-MM-DD'),
    },
    options(factory),
  );
}
