import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
    ]),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    { provide: 'CampaignsService', useExisting: CampaignsService },
  ],
  exports: [CampaignsService, 'CampaignsService'],
})
export class CampaignsModule {}
