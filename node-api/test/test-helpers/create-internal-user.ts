import factory from '../factories';
import { InternalUser, InternalRole } from '../../src/models';

export interface ICreateInternalUserOptions {
  internalUserAttrs?: Partial<InternalUser>;
  roleAttrs?: { name: string };
}

export default async function createInternalUser({
  internalUserAttrs = {},
  roleAttrs = {
    name: 'overdraftSupport',
  },
}: ICreateInternalUserOptions = {}): Promise<InternalUser> {
  const [agent, [internalRole]] = await Promise.all([
    factory.create<InternalUser>('internal-user', internalUserAttrs),
    InternalRole.findCreateFind({
      where: roleAttrs,
    }),
  ]);

  await agent.setInternalRoles([internalRole]);

  return agent;
}
