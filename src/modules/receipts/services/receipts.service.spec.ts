import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReceiptsService } from './receipts.service';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';

describe('ReceiptsService', () => {
  let service: ReceiptsService;

  const mockRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        {
          provide: getRepositoryToken(ReceiptEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list all receipts', async () => {
    const res = await service.listAll(1, 10);
    expect(res).toBeDefined();
    expect(res.meta.total).toBe(0);
  });
});
