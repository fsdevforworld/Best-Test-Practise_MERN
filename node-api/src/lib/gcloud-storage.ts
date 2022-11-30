import { memoize } from 'lodash';
import * as config from 'config';
import * as Storage from '@google-cloud/storage';
import { ReadStream } from 'fs';
import * as mimeTypes from 'mimetypes';
import * as csv from 'csv-parse';
import { Options as CsvOptions } from 'csv-parse';
import { dogstatsd } from './datadog-statsd';
import { isProdEnv } from './utils';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import logger from './logger';
import { BaseApiError } from './error';

const gcs = memoize(() => {
  return new (Storage as any)({
    projectId: isProdEnv() ? 'dave-173321' : 'dave-staging-173321',
  });
});

export function getBase64ImageMime(data: string): string {
  const mimeType = data.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  if (mimeType && mimeType.length > 1) {
    return mimeType[1];
  }

  if (data.charAt(0) === '/') {
    return 'image/jpeg';
  } else if (data.charAt(0) === 'R') {
    return 'image/gif';
  } else if (data.charAt(0) === 'i') {
    return 'image/png';
  }
  return null;
}

/**
 * Returns either a reference to a Storage.File if the source object was copied to the destination
 * or null if there was already a file in the destination.
 * A GCS path consists of gcs://<bucketName>/<fileName...>
 * A fileName can include any number of sub folders, separated by forward slashes
 *
 * @param srcPath Filename in GCS of the source file, not including the bucket name
 * @param dstPath Filename in GCS of the destination file, not including the bucket name
 * @param storage An object which contains the bucket name of the source and optionally a bucket name for the destination.
 *                If the dstBucketName is not provided, srcBucketName is used for both source and destination.
 */
export async function copyFile(
  srcPath: string,
  dstPath: string,
  storage: { srcBucketName: string; dstBucketName?: string },
): Promise<Storage.File> {
  const srcBucket = gcs().bucket(storage.srcBucketName);
  const dstBucket = storage.dstBucketName
    ? gcs().bucket(storage.dstBucketName)
    : gcs().bucket(storage.srcBucketName);

  const [file] = await srcBucket.file(srcPath).copy(dstBucket.file(dstPath));
  return file;
}

/**
 * Saves base64 image contents remotely and returns a public url.
 *
 * @param imageData Base64 string representation of the image's data.
 * @param directory Remote folder to place the image into. Usually
 *   describes the business application of the uploaded image.
 * @param prefix Name of the file, preceeding `-original.[extension]`.
 * @returns Public url of the image.
 */
async function saveImageToGCloud(
  imageData: string | Express.Multer.File,
  directory: string,
  prefix = '',
): Promise<string> {
  const bucketName: string = config.get('googleCloud.images.bucket');
  const bucket = gcs().bucket(bucketName);
  const env = process.env.NODE_ENV;
  const folderName = `images-${env}`;

  let imageBuffer: Buffer;
  let fileName: string;
  let mimeType: string;

  if (typeof imageData === 'string') {
    mimeType = getBase64ImageMime(imageData);

    fileName = `${prefix}-original.${mimeTypes.detectExtension(mimeType)}`;
    const base64EncodedImageString = imageData.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(base64EncodedImageString, 'base64');
  } else {
    imageBuffer = imageData.buffer;
    mimeType = imageData.mimetype;
    fileName = `${prefix}-original.${imageData.mimetype}`;
  }

  // Upload the image to the bucket
  const imageFile = `${folderName}/${directory}/${fileName}`;
  const file = bucket.file(imageFile);

  try {
    await file.save(imageBuffer, {
      metadata: { contentType: mimeType },
      public: true,
      validation: 'md5',
    });
    return `https://storage.googleapis.com/${bucketName}/${imageFile}`;
  } catch (error) {
    logger.error('Unable to upload profile image', error);
    return null;
  }
}

export function saveCSVToGCloud(externalProcessor: ExternalTransactionProcessor, fileName: string) {
  const bucketName = 'transaction-settlements';
  const bucket = gcs().bucket(bucketName);
  const file = bucket.file(`${externalProcessor}/${fileName}`);
  dogstatsd.increment('transaction_settlement.gcloud_upload_started');

  const stream = file.createWriteStream({
    resumable: false,
  });

  stream.on('error', (err: Error) => {
    dogstatsd.increment('transaction_settlement.gcloud_upload_error', 1, [`error:${err.name}`]);
  });

  stream.on('finish', () => {
    dogstatsd.increment('transaction_settlement.gcloud_upload_finished');
  });

  return stream;
}

export async function getGCSFile(bucketName: string, fileName: string): Promise<Storage.File> {
  const bucket = gcs().bucket(bucketName);
  return bucket.file(fileName);
}

export async function getGCSFileStream(bucketName: string, fileName: string): Promise<ReadStream> {
  const file = await getGCSFile(bucketName, fileName);

  const stream = file
    .createReadStream()
    .on('error', (error: Error) => logger.error('Error in gcloud stream', { error }))
    .on('response', () => logger.info(`Connected to GCS ${bucketName} - ${fileName}`))
    .on('end', () =>
      logger.info(`File ${bucketName} - ${fileName} completely downloaded from GCS`),
    );

  return stream;
}

/*
 * This method takes in a Mutler file, takes its buffer and saves that directly to a desired GCP bucket location
 */
export async function uploadFileBufferToGCloud(
  fileBuffer: Buffer,
  fileName: string,
  bucketName: string,
  desiredFilePath: string,
  datadogDomainDescriptor: string,
) {
  logger.info(`Start upload of gcs://${bucketName}/${desiredFilePath}/${fileName}`);

  const bucket = gcs().bucket(bucketName);
  const file = bucket.file(`${desiredFilePath}/${fileName}`);
  dogstatsd.increment(`csv_file_upload.${datadogDomainDescriptor}.gcloud_upload_started`);

  try {
    await file.save(fileBuffer, {
      metadata: { contentType: 'csv' },
      public: false,
      validation: 'md5',
    });
    dogstatsd.increment(`csv_file_upload.${datadogDomainDescriptor}.gcloud_upload_success`);
    logger.info(`End upload of gcs://${bucketName}/${desiredFilePath}/${fileName}`);

    return `https://storage.cloud.google.com/${bucketName}/${desiredFilePath}/${fileName}`;
  } catch (error) {
    logger.error(`Error during upload of gcs://${bucketName}/${desiredFilePath}/${fileName}`, {
      error,
    });
    dogstatsd.increment(`csv_file_upload.${datadogDomainDescriptor}.gcloud_upload_fail`);
    throw new BaseApiError('Error uploading file to Google Cloud', {
      statusCode: 500,
    });
  }
}

export async function getCSVFile(
  bucketName: string,
  fileName: string,
  options: CsvOptions = {},
): Promise<any[]> {
  logger.info(`Reading GCS CSV file gcs://${bucketName}/${fileName}`);

  // For larger reads, GCS may timeout the read stream,
  // so for processing CSVs we should read and operation
  // on the full file rather than doing stream operations
  const file = await getGCSFile(bucketName, fileName);
  const [buffer] = await file.download();

  return new Promise((resolve, reject) => {
    csv(buffer, options, (err, records) => {
      if (err) {
        logger.error('Error reading GCS CSV', { err, bucketName, fileName });
        reject(err);
      } else {
        // records are string[][] if no columns specified, otherwise it's an
        // array of objects with the column names as keys
        resolve(records);
      }
    });
  });
}

export default {
  saveImageToGCloud,
};
