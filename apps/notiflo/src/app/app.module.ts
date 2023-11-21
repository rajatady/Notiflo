import {Module} from '@nestjs/common';

import {AppController} from './app.controller';
import {AppService} from './app.service';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TemplatesModule} from './templates/templates.module';
import databaseConfiguration from '../../../../config/database.configuration';
import {MongooseModuleFactoryOptions, MongooseModule} from "@nestjs/mongoose";

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfiguration],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          uri: configService.get('database.uri')
        } as MongooseModuleFactoryOptions
      },
      inject: [ConfigService]
    }),
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
}
