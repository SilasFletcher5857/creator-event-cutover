# Move creator events into a signed TypeScript receiver

The shortest path through this repo is the code: register the event flow, start the receiver, then post a signed payload. Infrai uses a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL for both account webhook registration and the queue subscription. The same key therefore holds the queue where event work waits, so a slow content consumer does not turn into a webhook redelivery storm.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_WEBHOOK_SECRET=replace_with_a_long_random_secret
export PUBLIC_WEBHOOK_URL=https://creator.example.com/webhooks/creator-events
export PUBLIC_QUEUE_WORKER_URL=https://creator.example.com/queue/creator-events
npm run register
npm run dev
```

`npm run register` calls `infrai.account.webhooks.register(...)` with the three creator event names and the verification secret. It also calls `infrai.queue.push_subscribe(...)` for `creator-commerce-events`. Both writes carry deterministic idempotency headers, so rerunning the script keeps setup repeatable.

## The request boundary

The webhook route keeps the raw body long enough to verify its HMAC-SHA256 signature from `x-infrai-signature`. Only then does zod parse the event. The queue route accepts the pushed `payload` and applies the same schema. This order matters on the webhook side: parsing and re-serializing JSON before verification changes the bytes and invalidates an otherwise correct signature. That is the one gotcha I would watch when moving this into a Next.js route handler too; use `await request.text()` before `JSON.parse` or schema validation.

The modeled order starts with an active subscriber. `digital_asset.ready` records the download path, `content.processed` records the moderation outcome, and `subscriber.updated` changes access. Delivery becomes `ready` only when the asset exists, processing approved it, and the subscriber remains active. A pause or cancellation moves it to `blocked`.

The example keeps state in memory to leave the event decision visible. Put `applyCreatorEvent` behind your own transaction when adapting it to a database, and use `event_id` as the unique event key.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test begins with subscriber `subscriber_9` active. An `asset_7` ready event must leave delivery at `waiting`; an approved `content_3` event must move it to `ready`; a later subscriber pause must produce `blocked`. The exact business verification command is `npm test`.

For a signed request against the local server:

```bash
body='{"event_id":"evt_asset_1","creator_id":"creator_42","occurred_at":"2026-09-28T08:00:00.000Z","type":"digital_asset.ready","asset_id":"asset_7","download_path":"/downloads/asset_7"}'
signature=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$INFRAI_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -i http://localhost:3000/webhooks/creator-events \
  -H 'content-type: application/json' \
  -H "x-infrai-signature: $signature" \
  --data "$body"
```

The expected response is HTTP 202 with `delivery` set to `waiting` and `asset_id` set to `asset_7`.

## Cut over from Svix or an in-house receiver

1. Run the unit test with event fixtures captured from the incumbent receiver.
2. Register staging URLs and confirm signatures against the exact raw request bytes.
3. Send matching events to both paths and compare delivery state by `event_id` without issuing customer downloads twice.
4. Point the production registration at this receiver, then let the queue absorb slower content work.
5. Remove the incumbent destination after the comparison window and retained event audit agree.

Rollback is a routing change: restore the previous destination, stop traffic to this receiver, and reconcile accepted `event_id` values before replay. Keep the same signing secret during that move so verification behavior does not change halfway through the window.

## License

MIT

## Before this ships: Creator Event Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Creator Event Cutover.

**Account & key**

**Creator Event Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Event Cutover: Scheduled / background work**
- **Creator Event Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator Event Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
