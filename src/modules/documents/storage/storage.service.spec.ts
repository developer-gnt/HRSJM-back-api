import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { LocalStorageProvider } from './local-storage.provider';
import { CloudStorageProvider } from './cloud-storage.provider';
import { StorageService } from './storage.service';

describe('Storage Abstraction Tests', () => {
  const testUploadDir = path.resolve(process.cwd(), 'scratch', 'test-uploads');

  beforeAll(() => {
    fs.mkdirSync(testUploadDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testUploadDir, { recursive: true, force: true });
    } catch {}
  });

  describe('LocalStorageProvider', () => {
    it('should write buffer to destination and return relative path', async () => {
      const provider = new LocalStorageProvider(testUploadDir);
      const testBuffer = Buffer.from('test document content');
      const fileName = 'test-doc.pdf';

      const result = await provider.uploadFile(fileName, testBuffer, 'application/pdf');
      expect(result.driver).toBe('local');
      expect(result.storagePath).toContain('uploads');

      const fullSavedPath = path.resolve(testUploadDir, fileName);
      expect(fs.existsSync(fullSavedPath)).toBe(true);

      // Clean up
      await provider.deleteFile(path.join('uploads', fileName));
    });

    it('should delete file safely', async () => {
      const provider = new LocalStorageProvider(testUploadDir);
      const testFile = path.resolve(testUploadDir, 'to-delete.txt');
      fs.writeFileSync(testFile, 'temporary');

      await provider.deleteFile(path.join('scratch', 'test-uploads', 'to-delete.txt'));
      // should not throw even if path is non-existent
      await provider.deleteFile('non-existent.txt');
    });
  });

  describe('CloudStorageProvider', () => {
    it('should throw EXTERNAL_PROVIDER_UNCONFIGURED if bucket is not configured in production', async () => {
      const provider = new CloudStorageProvider(undefined);
      await expect(
        provider.uploadFile('file.pdf', Buffer.from('data'), 'application/pdf'),
      ).rejects.toThrow('EXTERNAL_PROVIDER_UNCONFIGURED');
    });

    it('should return cloud path and signed URL when bucket is configured', async () => {
      const provider = new CloudStorageProvider('hrsjm-prod-documents', 'ap-south-1');
      const res = await provider.uploadFile('kyc.pdf', Buffer.from('kyc'), 'application/pdf');

      expect(res.driver).toBe('cloud');
      expect(res.storagePath).toBe('s3://hrsjm-prod-documents/kyc.pdf');
      expect(res.publicUrl).toContain('hrsjm-prod-documents.s3.ap-south-1.amazonaws.com');

      const signedUrl = await provider.getSignedUrl('kyc.pdf', 300);
      expect(signedUrl).toContain('hrsjm-prod-documents');
    });
  });

  describe('StorageService', () => {
    it('should instantiate and upload via LocalStorageProvider by default', async () => {
      const mockConfig = {
        get: jest.fn(),
      } as unknown as ConfigService;

      const service = new StorageService(mockConfig);
      const res = await service.uploadFile('sample.png', Buffer.from('sample'), 'image/png');
      expect(res.driver).toBe('local');
      expect(res.storagePath).toBeDefined();

      await service.deleteFile(res.storagePath);
    });
  });
});
