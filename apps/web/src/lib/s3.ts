import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// Initialize S3 client
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = process.env.S3_BUCKET || 'signatureops-assets';
const PUBLIC_URL = process.env.S3_PUBLIC_URL || '';

// Allowed MIME types for signature assets
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

/**
 * Uploads a file to S3.
 */
export async function uploadAsset(
  tenantId: string,
  file: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed`);
  }

  // Validate file size
  if (file.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  // Generate unique key
  const ext = filename.split('.').pop() || 'png';
  const key = `${tenantId}/assets/${uuidv4()}.${ext}`;

  // Upload to S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    })
  );

  // Generate public URL
  const url = `${PUBLIC_URL}/${key}`;

  return {
    key,
    url,
    size: file.length,
    mimeType,
  };
}

/**
 * Deletes an asset from S3.
 */
export async function deleteAsset(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Generates a presigned URL for uploading directly from the browser.
 */
export async function getPresignedUploadUrl(
  tenantId: string,
  filename: string,
  mimeType: string
): Promise<{ url: string; key: string }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed`);
  }

  const ext = filename.split('.').pop() || 'png';
  const key = `${tenantId}/assets/${uuidv4()}.${ext}`;

  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn: 300 } // 5 minutes
  );

  return { url, key };
}

/**
 * Gets a presigned URL for downloading a private asset.
 */
export async function getPresignedDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { expiresIn: 3600 } // 1 hour
  );
}

/**
 * Gets the public URL for an asset.
 */
export function getAssetUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}
