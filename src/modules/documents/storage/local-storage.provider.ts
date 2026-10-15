import { Injectable, Logger } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import {
  IStorageProvider,
  StorageUploadResult,
} from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir: string;

  constructor(customUploadDir?: string) {
    this.uploadDir = customUploadDir || path.resolve(process.cwd(), 'uploads');
  }

  async uploadFile(
    fileName: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<StorageUploadResult> {
    await mkdir(this.uploadDir, { recursive: true });
    const safeFileName = path.basename(fileName);
    const destinationPath = path.resolve(this.uploadDir, safeFileName);

    if (!destinationPath.startsWith(this.uploadDir)) {
      throw new Error('Path traversal detected during local file upload');
    }

    await writeFile(destinationPath, buffer);
    const relativePath = path.join('uploads', safeFileName);

    return {
      storagePath: relativePath,
      driver: 'local',
    };
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      const absolutePath = path.resolve(process.cwd(), storagePath);
      if (absolutePath.startsWith(this.uploadDir)) {
        await unlink(absolutePath);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to clean up file at ${storagePath}: ${err.message}`);
    }
  }
}
