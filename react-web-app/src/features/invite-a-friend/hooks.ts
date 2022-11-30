import { useParams } from 'react-router';
import { Config } from 'lib/config';

export function useInviteUrl() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const inviteId = Config.REACT_APP_APPSFLYER_INVITE_ONE_LINK_ID;
  return inviteCode
    ? `https://trydave.onelink.me/${inviteId}/${sanitizeInviteCode(inviteCode)}`
    : undefined;
}

function sanitizeInviteCode(inviteCode: string) {
  return inviteCode.replace(/[^\w]+/g, '');
}
