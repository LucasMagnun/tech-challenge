import { z } from 'zod';

export const TransactionStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const CreateTransactionSchema = z.object({
  value: z.number().positive(),
});

export const TransactionCreatedEventSchema = z.object({
  transactionId: z.string().uuid(),
  value: z.number().positive(),
  createdAt: z.string().datetime(),
});

export const TransactionStatusUpdatedEventSchema = z.object({
  transactionId: z.string().uuid(),
  status: TransactionStatusSchema,
});

export type CreateTransactionDto = z.infer<typeof CreateTransactionSchema>;
export type TransactionCreatedEvent = z.infer<typeof TransactionCreatedEventSchema>;
export type TransactionStatusUpdatedEvent = z.infer<typeof TransactionStatusUpdatedEventSchema>;
