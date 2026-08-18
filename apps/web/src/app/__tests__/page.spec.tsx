import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
}

describe('Home', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    MockEventSource.instances = [];
    // @ts-expect-error - mock simplificado do EventSource para os testes
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('lista as transacoes retornadas pela api', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '1',
          value: '150.50',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('R$ 150.50')).toBeInTheDocument();
    });
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('atualiza a lista quando recebe um evento via sse', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });

    render(<Home />);

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    act(() => {
      source.onmessage?.({
        data: JSON.stringify({
          id: '2',
          value: '999',
          status: 'APPROVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('R$ 999')).toBeInTheDocument();
    });
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('envia uma nova transacao ao submeter o formulario', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<Home />);

    const input = screen.getByPlaceholderText('Valor da transação');
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: /criar/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ value: 250 }),
        }),
      );
    });
  });

  it('mostra mensagem de erro para valor invalido, sem chamar a api', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });

    render(<Home />);

    const input = screen.getByPlaceholderText('Valor da transação');
    await user.type(input, '-10');
    await user.click(screen.getByRole('button', { name: /criar/i }));

    expect(await screen.findByText('Informe um valor positivo.')).toBeInTheDocument();
  });
});
