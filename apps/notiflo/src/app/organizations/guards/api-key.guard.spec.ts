import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { OrganizationsService } from '../organizations.service';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockOrganizationsService: jest.Mocked<
    Pick<OrganizationsService, 'validateApiKey'>
  >;

  const mockOrganization = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Acme Corp',
    slug: 'acme-corp',
    description: 'Test org',
  };

  function createMockExecutionContext(
    apiKey?: string,
  ): ExecutionContext {
    const mockRequest: Record<string, unknown> = {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
        getNext: () => jest.fn(),
      }),
      getClass: () => ({}),
      getHandler: () => jest.fn(),
      getArgs: () => [mockRequest],
      getArgByIndex: () => mockRequest,
      switchToRpc: () => ({}),
      switchToWs: () => ({}),
      getType: () => 'http',
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    mockOrganizationsService = {
      validateApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request with valid API key in x-api-key header', async () => {
    mockOrganizationsService.validateApiKey.mockResolvedValue(
      mockOrganization as never,
    );

    const context = createMockExecutionContext('valid-api-key-123');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockOrganizationsService.validateApiKey).toHaveBeenCalledWith(
      'valid-api-key-123',
    );
  });

  it('should reject request with missing API key', async () => {
    const context = createMockExecutionContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockOrganizationsService.validateApiKey).not.toHaveBeenCalled();
  });

  it('should reject request with invalid API key', async () => {
    mockOrganizationsService.validateApiKey.mockResolvedValue(null);

    const context = createMockExecutionContext('invalid-key');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockOrganizationsService.validateApiKey).toHaveBeenCalledWith(
      'invalid-key',
    );
  });

  it('should attach organization to request object', async () => {
    mockOrganizationsService.validateApiKey.mockResolvedValue(
      mockOrganization as never,
    );

    const context = createMockExecutionContext('valid-api-key-123');
    await guard.canActivate(context);

    const request = context.switchToHttp().getRequest() as Record<string, unknown>;
    expect(request['organization']).toBeDefined();
    expect(request['organization']).toEqual(mockOrganization);
  });
});
