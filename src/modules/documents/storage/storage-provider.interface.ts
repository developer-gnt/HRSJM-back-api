export interface StorageUploadResult {
  storagePath: string;
  publicUrl?: string;
  driver: 'local' | 'cloud' | 'mock';
}

export interface IStorageProvider {
  uploadFile(
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult>;
  deleteFile(storagePath: string): Promise<void>;
  getSignedUrl?(storagePath: string, expiresInSeconds?: number): Promise<string>;
}
