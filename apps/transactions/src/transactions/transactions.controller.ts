import { Body, Controller, Get, Post, Query, Sse } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { map, Observable } from 'rxjs';
import { CreateTransactionSchema, type CreateTransactionDto } from '@tech-challenge/shared';
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
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.transactionsService.findAll(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Sse('stream')
  stream(): Observable<SseMessage> {
    return this.transactionsEvents
      .stream()
      .pipe(map((transaction) => ({ data: toTransactionResource(transaction) })));
  }

  @EventPattern('transaction.status.updated')
  async handleStatusUpdated(@Payload() payload: unknown) {
    await this.transactionsService.updateStatus(payload);
  }
}
