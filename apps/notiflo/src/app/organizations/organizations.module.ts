import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import { ApiKey, ApiKeySchema } from './schemas/api-key.schema';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: ApiKey.name, schema: ApiKeySchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, ApiKeyGuard],
  exports: [OrganizationsService, ApiKeyGuard],
})
export class OrganizationsModule {}
