import { z } from "zod";

const baseEvent = z.object({
  event_id: z.string().min(1),
  creator_id: z.string().min(1),
  occurred_at: z.string().datetime(),
});

export const creatorEventSchema = z.discriminatedUnion("type", [
  baseEvent.extend({
    type: z.literal("digital_asset.ready"),
    asset_id: z.string().min(1),
    download_path: z.string().startsWith("/"),
  }),
  baseEvent.extend({
    type: z.literal("subscriber.updated"),
    subscriber_id: z.string().min(1),
    status: z.enum(["active", "paused", "cancelled"]),
  }),
  baseEvent.extend({
    type: z.literal("content.processed"),
    content_id: z.string().min(1),
    outcome: z.enum(["approved", "rejected"]),
  }),
]);

export type CreatorEvent = z.infer<typeof creatorEventSchema>;

export type CreatorOrder = {
  creatorId: string;
  subscriberId: string;
  subscriberStatus: "active" | "paused" | "cancelled";
  asset?: { id: string; downloadPath: string };
  content?: { id: string; outcome: "approved" | "rejected" };
  delivery: "waiting" | "ready" | "blocked";
};

export function applyCreatorEvent(
  current: CreatorOrder,
  event: CreatorEvent,
): CreatorOrder {
  if (event.creator_id !== current.creatorId) return current;

  const next: CreatorOrder = { ...current };
  if (event.type === "digital_asset.ready") {
    next.asset = { id: event.asset_id, downloadPath: event.download_path };
  }
  if (event.type === "subscriber.updated" && event.subscriber_id === current.subscriberId) {
    next.subscriberStatus = event.status;
  }
  if (event.type === "content.processed") {
    next.content = { id: event.content_id, outcome: event.outcome };
  }

  if (next.subscriberStatus !== "active" || next.content?.outcome === "rejected") {
    next.delivery = "blocked";
  } else if (next.asset && next.content?.outcome === "approved") {
    next.delivery = "ready";
  } else {
    next.delivery = "waiting";
  }
  return next;
}
