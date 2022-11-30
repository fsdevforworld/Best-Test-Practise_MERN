import { google } from 'googleapis';
import * as config from 'config';

export function createDirectoryClient(keyFile?: string) {
  const auth = new google.auth.JWT({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/admin.directory.group.member.readonly'],
    subject: config.get<string>('directoryApi.adminEmail'),
  });

  const directoryClient = google.admin({
    version: 'directory_v1',
    auth,
  });

  return directoryClient;
}
