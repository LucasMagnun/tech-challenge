import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import { TransactionsEventsService } from './transactions-events.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let kafkaClient: { emit: jest.Mock };
  let transactionsEvents: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
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

  const baseDto = {
    accountExternalIdDebit: '11111111-1111-1111-1111-111111111111',
    accountExternalIdCredit: '22222222-2222-2222-2222-222222222222',
    transferTypeId: 1,
    value: 150.5,
  };

  it('deve criar uma transacao, publicar no kafka, emitir no sse e retornar no formato do contrato', async () => {
    const createdAt = new Date();
    const stored = {
      id: 'uuid-fake',
      accountExternalIdDebit: baseDto.accountExternalIdDebit,
      accountExternalIdCredit: baseDto.accountExternalIdCredit,
      transferTypeId: baseDto.transferTypeId,
      value: '150.50',
      status: 'PENDING',
      createdAt,
      updatedAt: createdAt,
    };
    prisma.transaction.create.mockResolvedValue(stored);

    const result = await service.create(baseDto);

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        value: baseDto.value,
        accountExternalIdDebit: baseDto.accountExternalIdDebit,
        accountExternalIdCredit: baseDto.accountExternalIdCredit,
        transferTypeId: baseDto.transferTypeId,
      },
    });
    expect(transactionsEvents.emit).toHaveBeenCalledWith(stored);
    expect(kafkaClient.emit).toHaveBeenCalledWith('transaction.created', {
      transactionId: stored.id,
      amount: 150.5,
      createdAt: createdAt.toISOString(),
    });
    expect(result).toEqual({
      transactionExternalId: 'uuid-fake',
      transactionType: { name: '1' },
      transactionStatus: { name: 'PENDING' },
      value: '150.50',
      createdAt: createdAt.toISOString(),
    });
  });

  it('deve retornar uma transacao pelo id externo', async () => {
    const createdAt = new Date();
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'uuid-fake',
      accountExternalIdDebit: 'a',
      accountExternalIdCredit: 'b',
      transferTypeId: 1,
      value: '500',
      status: 'APPROVED',
      createdAt,
      updatedAt: createdAt,
    });

    const result = await service.findOne('uuid-fake');

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({ where: { id: 'uuid-fake' } });
    expect(result).toEqual({
      transactionExternalId: 'uuid-fake',
      transactionType: { name: '1' },
      transactionStatus: { name: 'APPROVED' },
      value: '500',
      createdAt: createdAt.toISOString(),
    });
  });

  it('deve lancar NotFoundException quando a transacao nao existe', async () => {
    prisma.transaction.findUnique.mockResolvedValue(null);

    await expect(service.findOne('id-inexistente')).rejects.toThrow(NotFoundException);
  });

  it('deve listar transacoes paginadas ordenadas por data de criacao desc, mapeadas para o contrato', async () => {
    const createdAt = new Date();
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'uuid-1',
        accountExternalIdDebit: 'a',
        accountExternalIdCredit: 'b',
        transferTypeId: 2,
        value: '500',
        status: 'APPROVED',
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    prisma.transaction.count.mockResolvedValue(25);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      data: [
        {
          transactionExternalId: 'uuid-1',
          transactionType: { name: '2' },
          transactionStatus: { name: 'APPROVED' },
          value: '500',
          createdAt: createdAt.toISOString(),
        },
      ],
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('deve filtrar por status, transferTypeId e periodo', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    await service.findAll({
      status: 'APPROVED',
      transferTypeId: 1,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'APPROVED',
          transferTypeId: 1,
          createdAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T23:59:59.999Z'),
          },
        },
      }),
    );
  });

  it('deve limitar o tamanho maximo de pagina a 100', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 500 });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('deve atualizar o status e emitir no sse quando o evento for valido', async () => {
    const updated = {
      id: '11111111-1111-1111-1111-111111111111',
      accountExternalIdDebit: 'a',
      accountExternalIdCredit: 'b',
      transferTypeId: 1,
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
