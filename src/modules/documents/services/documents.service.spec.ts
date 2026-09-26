import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentType } from '../entities/document.entity';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repo: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'doc-1', ...x })),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new DocumentsService(repo as never, audit as never);
  });

  describe('upload', () => {
    it('throws BadRequestException if no file is provided', async () => {
      await expect(
        service.upload(undefined, { document_name: 'ID', document_type: DocumentType.OTHER }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if file is too large', async () => {
      const largeFile = {
        size: 15 * 1024 * 1024,
        originalname: 'id.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        service.upload(largeFile, { document_name: 'ID', document_type: DocumentType.OTHER }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for forbidden extension', async () => {
      const exeFile = {
        size: 1024,
        originalname: 'virus.exe',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        service.upload(exeFile, { document_name: 'ID', document_type: DocumentType.OTHER }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getById', () => {
    it('returns document for owner', async () => {
      repo.findOne.mockResolvedValue({ id: 'doc-1', user_id: 'u1', is_archived: false });
      const result = await service.getById('doc-1', 'u1', false);
      expect(result.id).toBe('doc-1');
    });

    it('throws ForbiddenException for unauthorized actor', async () => {
      repo.findOne.mockResolvedValue({ id: 'doc-1', user_id: 'u2', is_archived: false });
      await expect(service.getById('doc-1', 'u1', false)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if document not found or archived', async () => {
      repo.findOne.mockResolvedValue({ id: 'doc-1', user_id: 'u1', is_archived: true });
      await expect(service.getById('doc-1', 'u1', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('marks document as archived', async () => {
      repo.findOne.mockResolvedValue({ id: 'doc-1', user_id: 'u1', is_archived: false });
      const result = await service.archive('doc-1', 'u1', false);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ is_archived: true }));
      expect(result.id).toBe('doc-1');
    });
  });
});
