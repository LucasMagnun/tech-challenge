import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntiFraudModule } from './anti-fraud/anti-fraud.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AntiFraudModule,
  ],
})
export class AppModule {}
