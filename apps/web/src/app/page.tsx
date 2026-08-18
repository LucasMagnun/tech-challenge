'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { TransactionStatus } from '@tech-challenge/shared';

type Transaction = {
  id: string;
  value: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
};

type PaginatedResponse = {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const SSE_URL = process.env.NEXT_PUBLIC_SSE_URL ?? 'http://localhost:3000/transactions/stream';

const statusStyles: Record<TransactionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCurrency(value: string) {
  return currencyFormatter.format(Number(value));
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTransactions = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/transactions?page=${targetPage}&limit=10`);
      if (!response.ok) return;
      const result = (await response.json()) as PaginatedResponse;
      setTransactions(result.data);
      setTotalPages(result.totalPages);
    } catch {
      // Falha ao carregar a lista: o SSE mantém eventos futuros funcionando,
      // então não bloqueamos a tela por uma falha pontual de rede.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions(page);
  }, [page, fetchTransactions]);

  useEffect(() => {
    const eventSource = new EventSource(SSE_URL);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (event) => {
      const transaction = JSON.parse(event.data) as Transaction;

      // Só refletimos atualizações em tempo real quando o usuário está na
      // primeira página (a mais recente); nas demais, a paginação ficaria
      // inconsistente se itens fossem inseridos/deslocados por baixo dele.
      setPage((currentPage) => {
        if (currentPage !== 1) return currentPage;

        setTransactions((prev) => {
          const exists = prev.some((t) => t.id === transaction.id);
          if (exists) {
            return prev.map((t) => (t.id === transaction.id ? transaction : t));
          }
          return [transaction, ...prev].slice(0, 10);
        });

        return currentPage;
      });
    };

    eventSource.onerror = () => setConnected(false);

    return () => {
      eventSource.close();
    };
  }, []);

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
      if (page !== 1) setPage(1);
    } catch {
      setError('Não foi possível conectar à API.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Transações</h1>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connected ? 'Tempo real conectado' : 'Reconectando...'}
        </span>
      </div>

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
          className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Criar'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading && transactions.length === 0 ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border border-gray-200 px-4 py-3"
            >
              <div>
                <p className="font-medium text-gray-900">{formatCurrency(t.value)}</p>
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
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </main>
  );
}
