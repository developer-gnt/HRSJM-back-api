import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStorageProvider,
  StorageUploadResult,
} from './storage-provider.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { CloudStorageProvider } from './cloud-storage.provider';

@Injectable()
export class StorageService implements IStorageProvider {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: IStorageProvider;

  constructor(private readonly config: ConfigService) {
    const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    const isProduction =
      (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase() ===
      'production';

    if (driver === 's3' || driver === 'cloud' || (isProduction && driver !== 'local')) {
      this.logger.log('Initializing CloudStorageProvider for documents storage');
      this.provider = new CloudStorageProvider(
        process.env.STORAGE_BUCKET,
        process.env.STORAGE_REGION,
        process.env.STORAGE_URL,
      );
    } else {
      this.logger.log('Initializing LocalStorageProvider for documents storage');
      this.provider = new LocalStorageProvider();
    }
  }

  async uploadFile(
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult> {
    return this.provider.uploadFile(fileName, buffer, mimeType);
  }

  async deleteFile(storagePath: string): Promise<void> {
    return this.provider.deleteFile(storagePath);
  }

  async getSignedUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
    if (this.provider.getSignedUrl) {
      return this.provider.getSignedUrl(storagePath, expiresInSeconds);
    }
    return `/api/v1/documents/download?path=${encodeURIComponent(storagePath)}`;
  }
}
