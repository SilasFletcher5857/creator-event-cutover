import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { applyCreatorEvent, creatorEventSchema, type CreatorOrder } from "./creator_delivery.ts";

const secret = process.env.INFRAI_WEBHOOK_SECRET;
if (!secret) throw new Error("Set INFRAI_WEBHOOK_SECRET");

let order: CreatorOrder = {
  creatorId: "creator_42",
  subscriberId: "subscriber_9",
  subscriberStatus: "active",
  delivery: "waiting",
};

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function rawBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body;
}

export function hasValidSignature(raw: string, signature: string | undefined, key: string): boolean {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(raw).digest("hex"), "hex");
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

createServer(async (request, response) => {
  const isWebhook = request.method === "POST" && request.url === "/webhooks/creator-events";
  const isQueuePush = request.method === "POST" && request.url === "/queue/creator-events";
  if (!isWebhook && !isQueuePush) {
    json(response, 404, { error: "route not found" });
    return;
  }

  const raw = await rawBody(request);
  if (isWebhook) {
    const signature = request.headers["x-infrai-signature"] as string | undefined;
    if (!hasValidSignature(raw, signature, secret)) {
      json(response, 401, { error: "signature rejected" });
      return;
    }
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    json(response, 400, { error: "body is not JSON" });
    return;
  }
  const candidate = isQueuePush && typeof decoded === "object" && decoded !== null && "payload" in decoded
    ? (decoded as { payload: unknown }).payload
    : decoded;
  const parsed = creatorEventSchema.safeParse(candidate);
  if (!parsed.success) {
    json(response, 400, { error: "invalid creator event", issues: parsed.error.issues });
    return;
  }

  order = applyCreatorEvent(order, parsed.data);
  json(response, 202, {
    event_id: parsed.data.event_id,
    delivery: order.delivery,
    asset_id: order.asset?.id,
  });
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Creator event receiver listening on http://localhost:${process.env.PORT ?? 3000}`);
});
