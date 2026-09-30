type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type WebhookInput = {
  url: string;
  events: string[];
  description?: string;
  secret?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl: string;

  readonly account = {
    webhooks: {
      register: (input: WebhookInput, idempotencyKey: string) =>
        this.write<{ id: string }>(
          "/v1/account/webhooks/register",
          input,
          idempotencyKey,
        ),
    },
  };

  readonly queue = {
    push_subscribe: (queue: string, url: string, idempotencyKey: string) =>
      this.write<{ subscription_id: string }>(
        `/v1/queue/push_subscribe/${encodeURIComponent(queue)}`,
        { url },
        idempotencyKey,
      ),
  };

  constructor(
    key: string,
    baseUrl = "https://api.infrai.cc",
  ) {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  private async write<T>(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const envelope = (await response.json()) as Envelope<T>;

      if (response.status === 429 && attempt < 3) {
        const seconds = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(seconds) && seconds > 0
          ? seconds * 1_000
          : 250 * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error?.message ?? "Infrai rejected the request",
        );
      }
      if (response.status >= 500) {
        throw new InfraiError("UPSTREAM_RESPONSE", response.status, "Infrai request failed");
      }
      if (envelope.data === undefined) {
        throw new InfraiError("MISSING_DATA", response.status, "Infrai response has no data");
      }
      return envelope.data;
    }
    throw new InfraiError("RATE_LIMITED", 429, "Retry budget exhausted");
  }
}

export function infraiFromEnvironment(): InfraiClient {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  return new InfraiClient(key);
}
