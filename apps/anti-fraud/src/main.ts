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
        brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
      },
      consumer: {
        groupId: 'anti-fraud-consumer-group',
      },
    },
  });

  await app.listen();
}
bootstrap();
