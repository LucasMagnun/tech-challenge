import { Inject, Injectable } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import type { CreateTransactionDto, TransactionCreatedEvent } from '@tech-challenge/shared';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KAFKA_CLIENT) private readonly kafkaClient: ClientKafka,
  ) {}

  async create(dto: CreateTransactionDto) {
    const transaction = await this.prisma.transaction.create({
      data: {
        value: dto.value,
      },
    });

    const event: TransactionCreatedEvent = {
      transactionId: transaction.id,
      value: Number(transaction.value),
      createdAt: transaction.createdAt.toISOString(),
    };

    this.kafkaClient.emit('transaction.created', event);

    return transaction;
  }
}
