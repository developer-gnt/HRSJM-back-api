jest.mock('../../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

import { PassbookController } from './passbook.controller';
import { PassbookExportService } from '../services/passbook-export.service';
import {
  PassbookExportFormat,
  PassbookTransactionType,
} from '../dto/passbook-export.dto';
import { Response } from 'express';

describe('PassbookController', () => {
  let controller: PassbookController;
  let exportService: PassbookExportService;

  const mockExportService = {
    exportPassbook: jest.fn(),
  };

  beforeEach(() => {
    exportService = mockExportService as unknown as PassbookExportService;
    controller = new PassbookController(exportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exports passbook statement and writes headers and buffer to response', async () => {
    const mockBuffer = Buffer.from('PDF_CONTENT');
    mockExportService.exportPassbook.mockResolvedValue({
      buffer: mockBuffer,
      contentType: 'application/pdf',
      filename: 'HRSJM_Passbook_all_Statement.pdf',
    });

    const setHeaderMock = jest.fn();
    const endMock = jest.fn();
    const mockRes = {
      setHeader: setHeaderMock,
      end: endMock,
    } as unknown as Response;

    await controller.export(
      {
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.PDF,
      },
      mockRes,
    );

    expect(exportService.exportPassbook).toHaveBeenCalledWith({
      transactionType: PassbookTransactionType.ALL,
      format: PassbookExportFormat.PDF,
    });
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="HRSJM_Passbook_all_Statement.pdf"',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', String(mockBuffer.length));
    expect(endMock).toHaveBeenCalledWith(mockBuffer);
  });
});
