import { IInternalApiUserBanned } from '@dave-inc/banking-internal-api-client';
import IDaveBankingBanResource from './i-dave-banking-ban-resource';
interface IOptions {
  userId: number;
}

const serializer = (ban: IInternalApiUserBanned, { userId }: IOptions): IDaveBankingBanResource => {
  const { bannedAt, reason, reasonExtra } = ban;

  return {
    id: `${userId}-user-ban`,
    type: 'dave-banking-ban',
    attributes: {
      bannedAt,
      reason,
      reasonExtra,
    },
  };
};

export default serializer;
