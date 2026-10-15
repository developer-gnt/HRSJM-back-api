import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController (Liveness & Readiness Probes)', () => {
  let controller: HealthController;
  let mockDataSource: { query: jest.Mock };

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
    };
    controller = new HealthController(mockDataSource as unknown as DataSource);
  });

  describe('liveness probe (/health/liveness)', () => {
    it('should return ok with uptime and timestamp regardless of database state', () => {
      const result = controller.liveness();
      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(typeof result.timestamp).toBe('string');
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('readiness probe (/health/readiness)', () => {
    it('should return ok when database query succeeds', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await controller.readiness();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should throw ServiceUnavailableException when database query fails', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should not leak credentials or connection strings in error payload', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('FATAL: password authentication failed for user "postgres" at host 10.0.0.1:5432'),
      );

      try {
        await controller.readiness();
        fail('Should have thrown ServiceUnavailableException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const response = err.getResponse();
        expect(response).toEqual({
          status: 'error',
          database: 'disconnected',
          timestamp: expect.any(String),
        });
        expect(JSON.stringify(response)).not.toContain('postgres');
        expect(JSON.stringify(response)).not.toContain('10.0.0.1');
      }
    });
  });

  describe('overall health check (/health)', () => {
    it('should report ok when database is connected', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await controller.check();
      expect(res.status).toBe('ok');
      expect(res.database).toBe('connected');
    });

    it('should report degraded without crashing process when database is disconnected', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('DB down'));
      const res = await controller.check();
      expect(res.status).toBe('degraded');
      expect(res.database).toBe('disconnected');
    });
  });
});
