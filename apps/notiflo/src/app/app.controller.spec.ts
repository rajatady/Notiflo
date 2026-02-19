import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return health status with ok status', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getInfo', () => {
    it('should return platform info with name Notiflo', () => {
      const result = controller.getInfo();
      expect(result.name).toBe('Notiflo');
    });

    it('should list core capabilities', () => {
      const result = controller.getInfo();
      expect(result.capabilities).toContain('drift-sentinel-evaluation-engine');
      expect(result.capabilities).toContain('multi-channel-delivery');
      expect(result.capabilities).toContain('pluggable-strategies');
    });
  });
});
