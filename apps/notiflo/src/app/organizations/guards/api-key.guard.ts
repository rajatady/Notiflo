import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationsService } from '../organizations.service';

/**
 * Guard that validates the x-api-key header against stored API keys.
 * If valid, attaches the organization to the request object.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly organizationsService: OrganizationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key in x-api-key header');
    }

    const organization =
      await this.organizationsService.validateApiKey(apiKey);

    if (!organization) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    request['organization'] = organization;
    return true;
  }
}
