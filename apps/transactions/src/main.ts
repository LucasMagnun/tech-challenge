import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'transactions-consumer',
        brokers: [process.env.KAFKA_BROKERS ?? 'localhost:9092'],
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID_TRANSACTIONS ?? 'transactions-consumer-group',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.TRANSACTIONS_PORT ?? 3001);
}
bootstrap();
