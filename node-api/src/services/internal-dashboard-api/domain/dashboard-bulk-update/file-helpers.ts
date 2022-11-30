import * as stringify from 'csv-stringify/lib/sync';
import * as uuid from 'uuid';
import logger from '../../../../lib/logger';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { Duplex } from 'stream';
import { getGCSFile } from '../../../../lib/gcloud-storage';
import { uniq } from 'lodash';
import { BaseApiError } from '../../../../lib/error';

/*
 * Give a bucket and file key,
 * If running in staging or prod, returns signed URL
 * Else returns original file location
 */
async function getOutputFileUrl(
  baseUrl: string,
  bucketName: string,
  fileKey: string,
): Promise<string> {
  return `${baseUrl}/${bucketName}/${fileKey}`;
}

function csvBufferToStream(buffer: Buffer): Duplex {
  const newStream = new Duplex();
  newStream.push(buffer);
  newStream.push(null); // null is special value for streams. It adds EOF to stream.
  return newStream;
}

function generateUniqueFileNameForCsv(fileNameWithoutExtension: string): string {
  const miniUuid = uuid
    .v4()
    .toString()
    .substr(0, 5);
  const dateForFileName = moment()
    .tz(DEFAULT_TIMEZONE)
    .format('YYYYMMDDHHmm');
  return `${fileNameWithoutExtension}-${dateForFileName}-${miniUuid}.csv`;
}

function getFileKey(bucketName: string, fileUrl: string) {
  const index = fileUrl.indexOf(bucketName) + bucketName.length + 1; // +1 because of the slash

  return index === -1 ? null : fileUrl.substr(index);
}

/*
 * Given a CSV file location, returns that CSV as an array
 * Throws error if it could not download the file (not found) or if one of the rows could not be processed
 */
async function downloadBulkUpdateCsvAsArray(
  bucketName: string,
  inputFileUrl: string,
): Promise<number[]> {
  const fileKey = getFileKey(bucketName, inputFileUrl);

  try {
    const file = await getGCSFile(bucketName, fileKey);
    const data = await file.download();
    const users = data[0]
      .toString()
      .split('\n')
      .filter(a => a) // Removes last line, essentially.
      .map(a => a);

    return uniq(users.map(Number));
  } catch (error) {
    logger.error(`Error when downloading bulk update file ${inputFileUrl} from ${bucketName}`, {
      error,
    });
    throw new BaseApiError('Failed downloading input file', { statusCode: 500 });
  }
}

function generateCsvFileBufferFromObjectArray(inputArray: any[]): Buffer {
  return Buffer.from(stringify(inputArray, { header: true }));
}

export {
  getFileKey,
  getOutputFileUrl,
  csvBufferToStream,
  generateUniqueFileNameForCsv,
  downloadBulkUpdateCsvAsArray,
  generateCsvFileBufferFromObjectArray,
};
