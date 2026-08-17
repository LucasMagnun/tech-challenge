import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: { transaction: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: prisma }],
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
    expect(result).toEqual(expected);
  });
});
