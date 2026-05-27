import { generateObjectId } from '../internal/ids.js';
import { buildPartialUpdateBody } from '../internal/partial-update.js';
import type { TickTickClient } from '../client.js';
import type { TickTickCountdown, TickTickCountdownDraft } from '../types.js';

function toDateInt(date: Date | number | string): number {
  if (typeof date === 'number') return date;
  const d = date instanceof Date ? date : new Date(date);
  return parseInt(d.toISOString().slice(0, 10).replace(/-/g, ''), 10);
}

export class CountdownsModule {
  constructor(private readonly client: TickTickClient) {}

  async list(): Promise<readonly TickTickCountdown[]> {
    const res = await this.client.request<{ countdowns: readonly TickTickCountdown[] }>(
      'GET',
      '/api/v2/countdown/list',
    );
    return res.countdowns ?? [];
  }

  async create(draft: TickTickCountdownDraft): Promise<void> {
    await this.client.request('POST', '/api/v2/countdown/batch', {
      add: [{ id: generateObjectId(), ...draft, date: toDateInt(draft.date) }],
      update: [],
      delete: [],
    });
  }

  async update(params: Partial<TickTickCountdownDraft> & { id: string }): Promise<void> {
    const { date, ...rest } = params;
    const datePart = date !== undefined ? { date: toDateInt(date) } : {};
    await this.client.request('POST', '/api/v2/countdown/batch', {
      add: [],
      update: [buildPartialUpdateBody({ ...rest, ...datePart })],
      delete: [],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.request('POST', '/api/v2/countdown/batch', {
      add: [],
      update: [],
      delete: [id],
    });
  }
}
