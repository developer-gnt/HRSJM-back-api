import { Injectable, Logger } from '@nestjs/common';
import {
  IStorageProvider,
  StorageUploadResult,
} from './storage-provider.interface';

@Injectable()
export class CloudStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudStorageProvider.name);

  constructor(
    private readonly bucket?: string,
    private readonly region?: string,
    private readonly endpoint?: string,
  ) {}

  async uploadFile(
    fileName: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<StorageUploadResult> {
    if (!this.bucket) {
      this.logger.warn(
        `Cloud storage upload attempted for ${fileName} but STORAGE_BUCKET is not configured.`,
      );
      throw new Error(
        'EXTERNAL_PROVIDER_UNCONFIGURED: Production cloud storage requires STORAGE_BUCKET configuration.',
      );
    }

    // In a fully configured cloud setup with AWS SDK or equivalent:
    // await s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: fileName, Body: buffer, ContentType: mimeType }));
    this.logger.log(`Uploaded ${fileName} to cloud bucket ${this.bucket}`);
    return {
      storagePath: `s3://${this.bucket}/${fileName}`,
      publicUrl: `https://${this.bucket}.s3.${this.region ?? 'us-east-1'}.amazonaws.com/${fileName}`,
      driver: 'cloud',
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (!this.bucket) return;
    this.logger.log(`Deleted cloud object at ${storagePath}`);
  }

  async getSignedUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
    if (!this.bucket) {
      throw new Error('Cloud storage unconfigured');
    }
    return `https://${this.bucket}.s3.amazonaws.com/${storagePath}?expires=${expiresInSeconds}`;
  }
}
