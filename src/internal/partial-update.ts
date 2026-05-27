/**
 * Build a request body from a partial-update payload, used by every
 * `update`-style method on this client.
 *
 * **Three-intent contract** (consistent across modules):
 *
 * | Caller writes | Wire effect | TickTick does |
 * |---|---|---|
 * | Omit the key (or pass `undefined`) | Field NOT sent | Preserves current value |
 * | Pass a value (incl. `0`, `""`, `false`) | Field sent with that value | Updates to that value |
 * | Pass explicit `null` | Field sent as `null` | **Clears** the field |
 *
 * @remarks
 * Callers that build payloads from generic kwargs (MCP servers, dynamic
 * dispatchers) MUST distinguish "user didn't mention this field" from
 * "user wants this field cleared" before calling. Use a sentinel default
 * (e.g. Python `class _Unset: ...; UNSET = _Unset()`) and only forward
 * kwargs whose value is not the sentinel. Bare `None` defaults will
 * reach the library as `null` and WILL clear the field — that is
 * intentional given the contract above.
 *
 * Falsy non-nullish values (`0`, empty string, `false`) are preserved
 * verbatim because they are legitimate values, not absences.
 *
 * @param params - Caller-supplied partial-update params.
 * @returns A new object with `undefined` keys removed; `null` keys kept.
 */
export function buildPartialUpdateBody<T extends Record<string, unknown>>(
  params: T,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body[key] = value;
  }
  return body;
}
