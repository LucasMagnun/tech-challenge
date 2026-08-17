import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTransactionDto } from '@tech-challenge/shared';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        value: dto.value,
      },
    });
  }
}
