'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TransactionStatus } from '@tech-challenge/shared';

type Transaction = {
  id: string;
  value: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 3000;

const statusStyles: Record<TransactionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/transactions`);
      if (!response.ok) return;
      const data = (await response.json()) as Transaction[];
      setTransactions(data);
    } catch {
      // Falha silenciosa no polling: não queremos interromper a experiência
      // do usuário por uma falha pontual de rede. O próximo ciclo tenta de novo.
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numericValue = Number(value);
    if (!numericValue || numericValue <= 0) {
      setError('Informe um valor positivo.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: numericValue }),
      });

      if (!response.ok) {
        const body = await response.json();
        setError(body.fieldErrors?.value?.[0] ?? 'Erro ao criar transação.');
        return;
      }

      setValue('');
      await fetchTransactions();
    } catch {
      setError('Não foi possível conectar à API.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Transações</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          placeholder="Valor da transação"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-gray-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Criar'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <ul className="space-y-2">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded border border-gray-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-gray-900">R$ {t.value}</p>
              <p className="text-xs text-gray-500">
                {new Date(t.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[t.status]}`}
            >
              {t.status}
            </span>
          </li>
        ))}
        {transactions.length === 0 && (
          <p className="text-sm text-gray-500">Nenhuma transação ainda.</p>
        )}
      </ul>
    </main>
  );
}
