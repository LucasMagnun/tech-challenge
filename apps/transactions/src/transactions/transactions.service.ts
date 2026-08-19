import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import { TransactionsEventsService } from './transactions-events.service';
import { toTransactionResource } from './transactions.mapper';
import {
  TransactionStatusUpdatedEventSchema,
  type CreateTransactionDto,
  type TransactionCreatedEvent,
  type TransactionStatus,
} from '@tech-challenge/shared';
import type { Prisma } from '@prisma/client';

const DEFAULT_PAGE_SIZE = 10;

export type FindAllFilters = {
  page?: number;
  limit?: number;
  status?: TransactionStatus;
  transferTypeId?: number;
  startDate?: string;
  endDate?: string;
};

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
        accountExternalIdDebit: dto.accountExternalIdDebit,
        accountExternalIdCredit: dto.accountExternalIdCredit,
        transferTypeId: dto.transferTypeId,
      },
    });

    this.transactionsEvents.emit(transaction);

    const event: TransactionCreatedEvent = {
      transactionId: transaction.id,
      amount: Number(transaction.value),
      createdAt: transaction.createdAt.toISOString(),
    };

    this.kafkaClient.emit('transaction.created', event);

    return toTransactionResource(transaction);
  }

  async findOne(transactionExternalId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionExternalId },
    });

    if (!transaction) {
      throw new NotFoundException('Transacao nao encontrada');
    }

    return toTransactionResource(transaction);
  }

  async findAll(filters: FindAllFilters = {}) {
    const safePage = Math.max(1, filters.page ?? 1);
    const safeLimit = Math.min(Math.max(1, filters.limit ?? DEFAULT_PAGE_SIZE), 100);

    const where: Prisma.TransactionWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.transferTypeId !== undefined) {
      where.transferTypeId = filters.transferTypeId;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: data.map(toTransactionResource),
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
