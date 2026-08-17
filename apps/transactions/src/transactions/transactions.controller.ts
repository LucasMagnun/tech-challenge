import { Body, Controller, Post } from '@nestjs/common';
import { CreateTransactionSchema } from '@tech-challenge/shared';
import type { CreateTransactionDto } from '@tech-challenge/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateTransactionSchema)) dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }
}
