import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import { TransactionsEventsService } from './transactions-events.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let kafkaClient: { emit: jest.Mock };
  let transactionsEvents: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    kafkaClient = { emit: jest.fn() };
    transactionsEvents = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KAFKA_CLIENT, useValue: kafkaClient },
        { provide: TransactionsEventsService, useValue: transactionsEvents },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('deve criar uma transacao, publicar no kafka e emitir no sse', async () => {
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
    expect(transactionsEvents.emit).toHaveBeenCalledWith(expected);
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

  it('deve atualizar o status e emitir no sse quando o evento for valido', async () => {
    const updated = {
      id: '11111111-1111-1111-1111-111111111111',
      value: '500',
      status: 'APPROVED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.transaction.update.mockResolvedValue(updated);

    await service.updateStatus({
      transactionId: '11111111-1111-1111-1111-111111111111',
      status: 'APPROVED',
    });

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      data: { status: 'APPROVED' },
    });
    expect(transactionsEvents.emit).toHaveBeenCalledWith(updated);
  });

  it('nao deve atualizar nem emitir quando o evento for invalido', async () => {
    await service.updateStatus({ foo: 'bar' });

    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(transactionsEvents.emit).not.toHaveBeenCalled();
  });
});
