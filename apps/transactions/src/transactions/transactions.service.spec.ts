import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: { transaction: { create: jest.Mock } };
  let kafkaClient: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
      },
    };
    kafkaClient = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KAFKA_CLIENT, useValue: kafkaClient },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('deve criar uma transacao chamando o prisma com o valor informado', async () => {
    const expected = {
      id: 'uuid-fake',
      value: '150.50',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.transaction.create.mockResolvedValue(expected);

    const result = await service.create({ value: 150.5 });

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: { value: 150.5 },
    });
    expect(kafkaClient.emit).toHaveBeenCalledWith('transaction.created', {
      transactionId: expected.id,
      amount: 150.5,
      createdAt: expected.createdAt.toISOString(),
    });
    expect(result).toEqual(expected);
  });
});
