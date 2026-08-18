import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let kafkaClient: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
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

  it('deve listar transacoes ordenadas por data de criacao desc', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('deve atualizar o status da transacao quando o evento for valido', async () => {
    await service.updateStatus({
      transactionId: '11111111-1111-1111-1111-111111111111',
      status: 'APPROVED',
    });

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      data: { status: 'APPROVED' },
    });
  });

  it('nao deve atualizar quando o evento for invalido', async () => {
    await service.updateStatus({ foo: 'bar' });

    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
