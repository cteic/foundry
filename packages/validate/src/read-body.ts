export type ReadBodyResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'too-large' | 'invalid-encoding' };

function declaredLength(headers: Headers): number | undefined {
  const raw = headers.get('content-length');
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Reads a body as UTF-8 text and stops at `maxBytes`. `Content-Length` is
 * checked first as a cheap refusal, then the bytes are counted as they
 * arrive, because the header can be missing or wrong.
 */
export async function readBodyText(
  message: Request | Response,
  maxBytes: number
): Promise<ReadBodyResult> {
  const declared = declaredLength(message.headers);
  if (declared !== undefined && declared > maxBytes) {
    await message.body?.cancel();
    return { ok: false, reason: 'too-large' };
  }
  if (message.body === null) return { ok: true, text: '' };

  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, reason: 'too-large' };
    }
    chunks.push(value);
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(concat(chunks, total));
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'invalid-encoding' };
  }
}
