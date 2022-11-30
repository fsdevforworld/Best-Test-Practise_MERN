import { Request, Response } from 'express';
import { NotFoundError } from '../../lib/error';
import { BankAccount, EmailVerification, User } from '../../models';
import { isEmpty, orderBy } from 'lodash';

type Address = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
};

export async function getUser(req: Request, res: Response) {
  const daveUserId = parseInt(req.params.id, 10);

  const allowDeleted = req.query.allowDeleted !== undefined;

  const user = await User.findByPk(daveUserId, {
    include: [
      {
        model: EmailVerification,
      },
    ],
    paranoid: !allowDeleted,
  });

  if (!user) {
    throw new NotFoundError();
  }

  let address: Address;
  if (user.addressLine1 && user.city && user.state && user.zipCode) {
    address = {
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
    };
  }

  let mostRecentEmail: string;
  if (!isEmpty(user.emailVerifications)) {
    const emailVerifications = orderBy(user.emailVerifications, 'id', 'desc');
    mostRecentEmail = emailVerifications[0].email;
  }

  const bankAccounts = await BankAccount.getSupportedAccountsByUserNotDeletedOrDefault(user);
  const hasDaveBanking = bankAccounts.some(a => a.bankConnection.isDaveBanking());
  const result = bankAccounts.map(bankAccount => {
    return {
      id: bankAccount.id,
      displayName: bankAccount.displayName,
      lastFour: bankAccount.lastFour,
      bankingDataSource: bankAccount.bankConnection.bankingDataSource,
    };
  });

  res.send({
    address,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    id: user.id,
    hasDaveBanking,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    fraud: user.fraud,
    bankAccounts: result,
    mostRecentEmail,
  });
}
