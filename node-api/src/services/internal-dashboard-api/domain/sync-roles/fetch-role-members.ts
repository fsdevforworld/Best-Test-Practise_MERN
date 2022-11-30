import { admin_directory_v1 } from 'googleapis';
import { kebabCase } from 'lodash';

export default async function fetchRoleMembers(
  roleName: string,
  directoryClient: admin_directory_v1.Admin,
) {
  const members = await getMembers(roleName, directoryClient);

  return members.map(m => m.email);
}

async function getMembers(
  roleName: string,
  client: admin_directory_v1.Admin,
  membersAlreadyFetched: admin_directory_v1.Schema$Member[] = [],
  pageToken?: string,
): Promise<admin_directory_v1.Schema$Member[]> {
  const {
    data: { members = [], nextPageToken },
  } = await client.members.list({
    groupKey: `dash-${kebabCase(roleName)}@dave.com`,
    maxResults: 200,
    pageToken,
  });

  const fetchedMembers = membersAlreadyFetched.concat(members);

  if (nextPageToken) {
    return getMembers(roleName, client, fetchedMembers, nextPageToken);
  }

  return fetchedMembers;
}
