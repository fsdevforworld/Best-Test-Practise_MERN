import { Op } from 'sequelize';
import { Request, Response } from 'express';
import { User } from '../../models';
import { map, some, uniq } from 'lodash';
import { InvalidParametersError, NotFoundError } from '@dave-inc/error-types';

/**
 * Checks whether Users are duplicates of each other, for the purpose of determining
 * whether they can add the same payment method.
 *
 * /check_duplicate/:id?otherUsers=userId1,userId2,...
 *
 * ID is the "base user"
 * This endpoint will return one entry per "other" User ID, with the "duplicate" field
 * set to true if that user is identical to the base user. Each entry will take the form
 * {
 *   id: otherUserId,
 *   duplicate: true|false,
 *   deleted: epoch time when the user was deleted, or null if the user is active
 * }
 */
export async function checkDuplicateUsers(req: Request, res: Response) {
  const daveUserId = parseInt(req.params.id, 10);

  const user = await User.findByPk(daveUserId);
  if (!user) {
    throw new NotFoundError();
  }
  const otherUsersString = req.query.otherUsers;
  if (typeof otherUsersString !== 'string') {
    throw new InvalidParametersError('Must include otherUsers parameter');
  }

  const otherUserIds = uniq(
    otherUsersString
      .split(',')
      .map(i => parseInt(i, 10))
      .filter(i => i !== user.id),
  );
  if (some(otherUserIds, isNaN)) {
    throw new InvalidParametersError('All otherUsers parameters must be numeric');
  }

  const otherUsers = await User.findAll({
    where: { id: { [Op.in]: otherUserIds } },
    paranoid: false,
  });

  const data = map(otherUsers, u => constructEntry(user, u));

  res.send(data);
}

function constructEntry(baseUser: User, otherUser: User) {
  const identical = isIdenticalUser(baseUser, otherUser);

  return { id: otherUser.id, identical, deleted: serializeDeleted(otherUser) };
}

function serializeDeleted(user: User): number | null {
  if (!user.isSoftDeleted()) {
    return null;
  }

  return user.deleted.valueOf();
}

function isIdenticalUser(baseUser: User, otherUser: User): boolean {
  return (
    otherUser.firstName === baseUser.firstName &&
    otherUser.lastName === baseUser.lastName &&
    otherUser.birthdate.isSame(baseUser.birthdate)
  );
}
