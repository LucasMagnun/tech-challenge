import { Body, Controller, Get, Param, Post, Query, Sse } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { map, Observable } from 'rxjs';
import {
  CreateTransactionSchema,
  type CreateTransactionDto,
  type TransactionStatus,
} from '@tech-challenge/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TransactionsService } from './transactions.service';
import { TransactionsEventsService } from './transactions-events.service';
import { toTransactionResource } from './transactions.mapper';

type SseMessage = { data: unknown };

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly transactionsEvents: TransactionsEventsService,
  ) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateTransactionSchema)) dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TransactionStatus,
    @Query('transferTypeId') transferTypeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionsService.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      transferTypeId: transferTypeId ? Number(transferTypeId) : undefined,
      startDate,
      endDate,
    });
  }

  @Sse('stream')
  stream(): Observable<SseMessage> {
    return this.transactionsEvents
      .stream()
      .pipe(map((transaction) => ({ data: toTransactionResource(transaction) })));
  }

  @Get(':transactionExternalId')
  findOne(@Param('transactionExternalId') transactionExternalId: string) {
    return this.transactionsService.findOne(transactionExternalId);
  }

  @EventPattern('transaction.status.updated')
  async handleStatusUpdated(@Payload() payload: unknown) {
    await this.transactionsService.updateStatus(payload);
  }
}
