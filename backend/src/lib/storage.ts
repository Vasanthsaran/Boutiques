import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

export interface StoredObject {
  stream: Readable;
  contentType?: string;
  contentLength?: number;
}

export interface StorageDriver {
  name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Direct public URL if the bucket/CDN is public; otherwise null (served via /media). */
  publicUrl(key: string): string | null;
  healthCheck(): Promise<void>;
}

const safeKey = (key: string) => {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  return key;
};

class LocalStorage implements StorageDriver {
  name = 'local';
  root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
    fs.mkdirSync(this.root, { recursive: true });
  }
  private file(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async put(key: string, body: Buffer) {
    const file = this.file(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, body);
    await fsp.rename(tmp, file);
  }
  async get(key: string) {
    const file = this.file(key);
    try {
      const stat = await fsp.stat(file);
      return { stream: fs.createReadStream(file), contentLength: stat.size };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fsp.rm(this.file(key), { force: true });
  }
  publicUrl() {
    return null;
  }
  async healthCheck() {
    await fsp.access(this.root, fs.constants.W_OK);
  }
}

class S3Storage implements StorageDriver {
  name = 's3';
  client: S3Client;
  bucket: string;
  constructor() {
    this.bucket = config.S3_BUCKET!;
    this.client = new S3Client({
      region: config.S3_REGION || 'auto',
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
  async get(key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      if (!out.Body) return null;
      return {
        stream: out.Body as Readable,
        contentType: out.ContentType,
        contentLength: out.ContentLength,
      };
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  publicUrl(key: string) {
    return config.S3_PUBLIC_BASE_URL ? `${config.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}` : null;
  }
  async healthCheck() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

export const storage: StorageDriver =
  config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage(config.LOCAL_STORAGE_DIR);
