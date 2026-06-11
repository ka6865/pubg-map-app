import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let r2ClientInstance: S3Client | null = null;

export type R2BucketUsage = {
  bucketName: string;
  fileCount: number;
  totalSizeBytes: number;
  scannedPages: number;
  truncated: boolean;
  configured: boolean;
};

function getR2Client(): S3Client {
  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });
  }
  return r2ClientInstance;
}

function getBucketName(): string {
  return process.env.CLOUDFLARE_R2_BUCKET_NAME || 'telemetry';
}

/**
 * Uploads a text/binary buffer file to Cloudflare R2 Bucket
 * @param key The destination path or filename in the bucket
 * @param body The stringified JSON or file content buffer
 * @param contentType The MIME content type of the file
 */
export async function uploadToR2(key: string, body: string | Buffer, contentType: string = 'application/json'): Promise<void> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Skipping upload.');
    return;
  }

  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  try {
    await getR2Client().send(command);
  } catch (error) {
    console.error(`[R2 Error] Failed to upload file to R2: ${key}`, error);
    throw error;
  }
}

/**
 * Generates a Secure Presigned URL for Direct Client Download with expiration time
 * @param key The filename/key of the file stored in the R2 bucket
 * @param expiresInSeconds Duration in seconds for the link to remain active (default: 3600s / 1 Hour)
 */
export async function getPresignedUrlFromR2(key: string, expiresInSeconds: number = 3600): Promise<string> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Returning local mock URL.');
    return `/mock-telemetry/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  try {
    const url = await getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    console.error(`[R2 Error] Failed to generate Presigned URL for key: ${key}`, error);
    throw error;
  }
}

/**
 * Downloads a text/JSON file directly from Cloudflare R2 bucket
 * @param key The filename/key of the file to retrieve
 */
export async function downloadFromR2(key: string): Promise<string | null> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Returning null.');
    return null;
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  try {
    const response = await getR2Client().send(command);
    if (!response.Body) return null;
    return await response.Body.transformToString();
  } catch (error: any) {
    // If object does not exist, return null gracefully instead of crashing
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error(`[R2 Error] Failed to download file from R2: ${key}`, error);
    throw error;
  }
}

/**
 * Deletes a single object from Cloudflare R2 bucket
 * @param key The filename/key of the file to remove
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Skipping delete.');
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  try {
    await getR2Client().send(command);
  } catch (error) {
    console.error(`[R2 Error] Failed to delete file from R2: ${key}`, error);
    throw error;
  }
}

/**
 * Deletes multiple objects in a single API request from Cloudflare R2 bucket
 * @param keys Array of filenames/keys of the files to remove
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT || keys.length === 0) {
    return;
  }

  // AWS S3 standard limit for DeleteObjects is 1000 items per request
  const chunks = [];
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000));
  }

  for (const chunk of chunks) {
    const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const command = new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: {
        Objects: chunk.map(key => ({ Key: key })),
        Quiet: true,
      },
    });

    try {
      await getR2Client().send(command);
    } catch (error) {
      console.error('[R2 Error] Failed to batch delete files from R2', error);
      throw error;
    }
  }
}

/**
 * Lists all objects stored inside the Cloudflare R2 Bucket
 * @param limit Maximum number of files to return (default: 1000)
 */
export async function listR2Files(limit: number = 1000): Promise<{ key: string; size: number }[]> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Returning empty file list.');
    return [];
  }

  const files: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;
  try {
    do {
      const remaining = Math.max(limit - files.length, 0);
      if (remaining === 0) break;
      const command = new ListObjectsV2Command({
        Bucket: getBucketName(),
        MaxKeys: Math.min(remaining, 1000),
        ContinuationToken: continuationToken,
      });
      const response = await getR2Client().send(command);
      response.Contents?.forEach(item => {
        if (!item.Key || files.length >= limit) return;
        files.push({ key: item.Key, size: item.Size || 0 });
      });
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return files;
  } catch (error) {
    console.error('[R2 Error] Failed to list files from R2 Bucket', error);
    throw error;
  }
}

/**
 * Calculates R2 bucket usage with pagination without holding every object in memory.
 */
export async function getR2BucketUsage(options: { maxObjects?: number; pageSize?: number } = {}): Promise<R2BucketUsage> {
  const bucketName = getBucketName();
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Returning zero usage.');
    return {
      bucketName,
      fileCount: 0,
      totalSizeBytes: 0,
      scannedPages: 0,
      truncated: false,
      configured: false
    };
  }

  const maxObjects = Math.max(1, options.maxObjects || 100000);
  const pageSize = Math.min(Math.max(options.pageSize || 1000, 1), 1000);
  let continuationToken: string | undefined;
  let fileCount = 0;
  let totalSizeBytes = 0;
  let scannedPages = 0;
  let truncated = false;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: Math.min(pageSize, maxObjects - fileCount),
        ContinuationToken: continuationToken,
      });
      const response = await getR2Client().send(command);
      scannedPages += 1;
      response.Contents?.forEach(item => {
        if (fileCount >= maxObjects) return;
        fileCount += 1;
        totalSizeBytes += item.Size || 0;
      });
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      if (fileCount >= maxObjects && continuationToken) {
        truncated = true;
        break;
      }
    } while (continuationToken);

    return {
      bucketName,
      fileCount,
      totalSizeBytes,
      scannedPages,
      truncated,
      configured: true
    };
  } catch (error) {
    console.error('[R2 Error] Failed to calculate R2 bucket usage', error);
    throw error;
  }
}

/**
 * Downloads a binary file as a Buffer from Cloudflare R2 bucket
 * @param key The filename/key of the file to retrieve
 */
export async function downloadBufferFromR2(key: string): Promise<Buffer | null> {
  if (!process.env.CLOUDFLARE_R2_ENDPOINT) {
    console.warn('[R2 Warning] Cloudflare R2 Credentials are not configured. Returning null.');
    return null;
  }

  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });

  try {
    const response = await getR2Client().send(command);
    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error(`[R2 Error] Failed to download buffer from R2: ${key}`, error);
    throw error;
  }
}
