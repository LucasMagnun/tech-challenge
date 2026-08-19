import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'anti-fraud-service',
        brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID_ANTI_FRAUD ?? 'anti-fraud-consumer-group',
      },
    },
  });

  await app.listen();
}
bootstrap();
