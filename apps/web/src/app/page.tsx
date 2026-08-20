'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { TransactionStatus } from '@tech-challenge/shared';

type Transaction = {
  transactionExternalId: string;
  transactionType: { name: string };
  transactionStatus: { name: TransactionStatus };
  value: string;
  createdAt: string;
};

type PaginatedResponse = {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type Filters = {
  status: TransactionStatus | '';
  transferTypeId: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTERS: Filters = { status: '', transferTypeId: '', startDate: '', endDate: '' };
const TRANSFER_TYPES = ['1', '2', '3'];

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

function buildQuery(page: number, filters: Filters) {
  const params = new URLSearchParams({ page: String(page), limit: '10' });
  if (filters.status) params.set('status', filters.status);
  if (filters.transferTypeId) params.set('transferTypeId', filters.transferTypeId);
  if (filters.startDate) params.set('startDate', new Date(filters.startDate).toISOString());
  if (filters.endDate) params.set('endDate', new Date(filters.endDate).toISOString());
  return params.toString();
}

function CreateTransactionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [value, setValue] = useState('');
  const [transferTypeId, setTransferTypeId] = useState(TRANSFER_TYPES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleValueChange(raw: string) {
    const sanitized = raw.replace(/[^0-9.,]/g, '').replace(',', '.');
    const parts = sanitized.split('.');
    const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setValue(normalized);
  }

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
        body: JSON.stringify({
          value: numericValue,
          accountExternalIdDebit: crypto.randomUUID(),
          accountExternalIdCredit: crypto.randomUUID(),
          transferTypeId: Number(transferTypeId),
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        setError(body.fieldErrors?.value?.[0] ?? 'Erro ao criar transação.');
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError('Não foi possível conectar à API.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Nova transação</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="modal-value" className="mb-1 block text-sm text-gray-700">
              Valor
            </label>
            <input
              id="modal-value"
              type="text"
              inputMode="decimal"
              placeholder="Valor da transação"
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="modal-transfer-type" className="mb-1 block text-sm text-gray-700">
              Tipo de transferência
            </label>
            <select
              id="modal-transfer-type"
              value={transferTypeId}
              onChange={(e) => setTransferTypeId(e.target.value)}
              className="w-full cursor-pointer rounded border border-gray-300 px-3 py-2 text-gray-900"
            >
              {TRANSFER_TYPES.map((type) => (
                <option key={type} value={type}>
                  Tipo {type}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [connected, setConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTransactions = useCallback(async (targetPage: number, targetFilters: Filters) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/transactions?${buildQuery(targetPage, targetFilters)}`,
      );
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
    fetchTransactions(page, filters);
  }, [page, filters, fetchTransactions]);

  useEffect(() => {
    const eventSource = new EventSource(SSE_URL);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (event) => {
      const transaction = JSON.parse(event.data) as Transaction;

      setPage((currentPage) => {
        if (currentPage !== 1) return currentPage;

        setTransactions((prev) => {
          const exists = prev.some(
            (t) => t.transactionExternalId === transaction.transactionExternalId,
          );
          if (exists) {
            return prev.map((t) =>
              t.transactionExternalId === transaction.transactionExternalId ? transaction : t,
            );
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

  function handleFilterChange<K extends keyof Filters>(key: K, val: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function handleTransactionCreated() {
    if (page !== 1) {
      setPage(1);
    } else {
      fetchTransactions(1, filters);
    }
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Transações</h1>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
          {connected ? 'Tempo real conectado' : 'Reconectando...'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mb-6 cursor-pointer rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
      >
        + Criar transação
      </button>

      {modalOpen && (
        <CreateTransactionModal
          onClose={() => setModalOpen(false)}
          onCreated={handleTransactionCreated}
        />
      )}

      <div className="mb-6 rounded border border-gray-200 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="status-filter" className="mb-1 block text-xs text-gray-500">
              Status
            </label>
            <select
              id="status-filter"
              value={filters.status}
              onChange={(e) =>
                handleFilterChange('status', e.target.value as TransactionStatus | '')
              }
              className="w-full cursor-pointer rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="APPROVED">Aprovada</option>
              <option value="REJECTED">Rejeitada</option>
            </select>
          </div>
          <div>
            <label htmlFor="type-filter" className="mb-1 block text-xs text-gray-500">
              Tipo
            </label>
            <input
              id="type-filter"
              type="text"
              inputMode="numeric"
              placeholder="Ex: 1"
              value={filters.transferTypeId}
              onChange={(e) => handleFilterChange('transferTypeId', e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label htmlFor="start-date-filter" className="mb-1 block text-xs text-gray-500">
              De
            </label>
            <input
              id="start-date-filter"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full cursor-pointer rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label htmlFor="end-date-filter" className="mb-1 block text-xs text-gray-500">
              Até
            </label>
            <input
              id="end-date-filter"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full cursor-pointer rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 cursor-pointer text-xs text-blue-600 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {loading && transactions.length === 0 ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((t) => (
            <li key={t.transactionExternalId}>
              <Link
                href={`/transactions/${t.transactionExternalId}`}
                className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(t.value)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[t.transactionStatus.name]}`}
                >
                  {t.transactionStatus.name}
                </span>
              </Link>
            </li>
          ))}
          {transactions.length === 0 && !loading && (
            <p className="text-sm text-gray-500">Nenhuma transação encontrada.</p>
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
