import { Body, Controller, Get, Post } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CreateTransactionSchema, type CreateTransactionDto } from '@tech-challenge/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateTransactionSchema)) dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  @Get()
  findAll() {
    return this.transactionsService.findAll();
  }

  @EventPattern('transaction.status.updated')
  async handleStatusUpdated(@Payload() payload: unknown) {
    await this.transactionsService.updateStatus(payload);
  }
}
