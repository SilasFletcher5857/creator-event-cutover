import assert from "node:assert/strict";
import test from "node:test";
import { applyCreatorEvent, creatorEventSchema, type CreatorOrder } from "../src/creator_delivery.ts";

test("delivery waits for processing and stops after a subscriber pauses", () => {
  const initial: CreatorOrder = {
    creatorId: "creator_42",
    subscriberId: "subscriber_9",
    subscriberStatus: "active",
    delivery: "waiting",
  };
  const asset = creatorEventSchema.parse({
    event_id: "evt_asset_1",
    creator_id: "creator_42",
    occurred_at: "2026-09-28T08:00:00.000Z",
    type: "digital_asset.ready",
    asset_id: "asset_7",
    download_path: "/downloads/asset_7",
  });
  const processed = creatorEventSchema.parse({
    event_id: "evt_content_1",
    creator_id: "creator_42",
    occurred_at: "2026-09-28T08:01:00.000Z",
    type: "content.processed",
    content_id: "content_3",
    outcome: "approved",
  });
  const paused = creatorEventSchema.parse({
    event_id: "evt_subscriber_1",
    creator_id: "creator_42",
    occurred_at: "2026-09-28T08:02:00.000Z",
    type: "subscriber.updated",
    subscriber_id: "subscriber_9",
    status: "paused",
  });

  const withAsset = applyCreatorEvent(initial, asset);
  assert.equal(withAsset.delivery, "waiting");
  const ready = applyCreatorEvent(withAsset, processed);
  assert.equal(ready.delivery, "ready");
  assert.equal(ready.asset?.downloadPath, "/downloads/asset_7");
  assert.equal(applyCreatorEvent(ready, paused).delivery, "blocked");
});
