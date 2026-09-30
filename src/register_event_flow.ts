import { createHash } from "node:crypto";
import { infraiFromEnvironment } from "./infrai_client.ts";

const publicUrl = process.env.PUBLIC_WEBHOOK_URL;
const workerUrl = process.env.PUBLIC_QUEUE_WORKER_URL;
const secret = process.env.INFRAI_WEBHOOK_SECRET;
const queue = process.env.CREATOR_EVENT_QUEUE ?? "creator-commerce-events";

if (!publicUrl || !workerUrl || !secret) {
  throw new Error(
    "Set PUBLIC_WEBHOOK_URL, PUBLIC_QUEUE_WORKER_URL, and INFRAI_WEBHOOK_SECRET",
  );
}

const stableKey = (kind: string, value: string) =>
  createHash("sha256").update(`${kind}:${value}`).digest("hex");

const infrai = infraiFromEnvironment();
const webhook = await infrai.account.webhooks.register(
  {
    url: publicUrl,
    events: ["digital_asset.ready", "subscriber.updated", "content.processed"],
    description: "Creator commerce event intake",
    secret,
  },
  stableKey("creator-webhook", publicUrl),
);
const subscription = await infrai.queue.push_subscribe(
  queue,
  workerUrl,
  stableKey("creator-queue-subscription", `${queue}:${workerUrl}`),
);

console.log(JSON.stringify({ webhook_id: webhook.id, subscription_id: subscription.subscription_id }, null, 2));
