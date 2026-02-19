import { Test } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getHealth', () => {
    it('should return ok status', () => {
      const result = service.getHealth();
      expect(result.status).toBe('ok');
      expect(result.version).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getInfo', () => {
    it('should return platform name Notiflo', () => {
      const result = service.getInfo();
      expect(result.name).toBe('Notiflo');
      expect(result.capabilities.length).toBeGreaterThan(0);
    });
  });
});
