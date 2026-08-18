import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import { TransactionsEventsService } from './transactions-events.service';
import {
  TransactionStatusUpdatedEventSchema,
  type CreateTransactionDto,
  type TransactionCreatedEvent,
} from '@tech-challenge/shared';

const DEFAULT_PAGE_SIZE = 10;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsEvents: TransactionsEventsService,
    @Inject(KAFKA_CLIENT) private readonly kafkaClient: ClientKafka,
  ) {}

  async create(dto: CreateTransactionDto) {
    const transaction = await this.prisma.transaction.create({
      data: {
        value: dto.value,
      },
    });

    this.transactionsEvents.emit(transaction);

    const event: TransactionCreatedEvent = {
      transactionId: transaction.id,
      amount: Number(transaction.value),
      createdAt: transaction.createdAt.toISOString(),
    };

    this.kafkaClient.emit('transaction.created', event);

    return transaction;
  }

  async findAll(page = 1, limit = DEFAULT_PAGE_SIZE) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.transaction.count(),
    ]);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async updateStatus(rawPayload: unknown) {
    const parsed = TransactionStatusUpdatedEventSchema.safeParse(rawPayload);

    if (!parsed.success) {
      this.logger.error(`Evento invalido recebido: ${JSON.stringify(parsed.error.flatten())}`);
      return;
    }

    const { transactionId, status } = parsed.data;

    try {
      const transaction = await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status },
      });
      this.transactionsEvents.emit(transaction);
      this.logger.log(`Transacao ${transactionId} atualizada para ${status}`);
    } catch (error) {
      this.logger.error(`Falha ao atualizar transacao ${transactionId}: ${error}`);
    }
  }
}
