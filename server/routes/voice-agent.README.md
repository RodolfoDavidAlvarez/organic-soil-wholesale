# OSW Voice Sales Assistant — Configuration Guide

> Wires the floating mic button on the OSW site to an ElevenLabs Conversational Agent that sells the three MSRP-priced retail SKUs (Nature's Blanket Mulch, Simon's Gold Dairy Compost, Mikey's Worm Poop Castings) and hands off to the existing `/checkout` (SSW Stripe).

## 1. Server `.env` keys

Add to `server/.env`:

```bash
# ElevenLabs Conversational Agent
ELEVENLABS_API_KEY=sk-your-key
ELEVENLABS_AGENT_ID=agent_xxx
VOICE_AGENT_TOOL_SECRET=generate-a-long-random-string
# Optional cost cap (USD per day across all sessions). 0 / unset = no cap.
VOICE_AGENT_DAILY_USD=15
```

`STRIPE_SECRET_KEY` must be the SSW account key (`acct_1LW3cXG0O2r9Aau4`). On boot, the server logs `[stripe] connected as ... — SSW match: YES/NO`. If it says NO, `STRIPE_SECRET_KEY` in `server/.env` is wrong.

## 2. Install client dependency

```bash
cd client
npm install @elevenlabs/react
```

## 3. Create the ElevenLabs Agent

Dashboard → Conversational AI → Agents → New Agent.

### Voice & model

- **Voice**: pick a professional, neutral US voice (e.g. "Adam" or "Rachel" — no character voices)
- **Model**: `eleven_turbo_v2_5` (English) or `eleven_flash_v2_5` for lowest latency
- **LLM**: Turbo tier — GPT-4o-mini

### First message

```
Hey, I'm OSW's order assistant. What are you working on, and how much do you need?
```

### System prompt

```
You are the order-taking assistant for Organic Soil Wholesale (OSW). You sell ONLY these three retail products at MSRP:

1. Nature's Blanket Mulch — 2 cu ft bag — $8.99
2. Simon's Gold Dairy Compost — 1 cu ft bag $14.95 OR 9 lb bag $6.95
3. Mikey's Worm Poop Castings — 1 cu ft bag $34.90 OR 9 lb bag $18.10

CONSTRAINTS (HARD RULES):
- Order pickup only — no delivery via this assistant.
- Yard hours: Tue–Sat, 8 AM–4 PM Arizona time (closed 1–2 PM for lunch). Pickup must be at least 30 minutes from now.
- Never invent a product. If asked about something not in the list above, say we don't carry it through this quick-order assistant and offer to forward them to a wholesale rep.
- Never quote a discount or wholesale price. MSRP only.
- Never ask for credit card info — payment happens after handoff.

BEHAVIOR:
- Ask one short clarifying question at a time. No long explanations.
- When the customer describes an area or use case (sqft, plants, beds), call the `recommend` tool to get correct quantities — never do the math yourself.
- After each item is added, briefly confirm "Added X bags — anything else?" and watch for a yes/no.
- Before checkout, call `get_pickup_options` to read out 2-3 valid pickup times and ask which they want, then call `set_pickup_time`.
- Once the customer says they're ready to pay, call `start_checkout`. After it returns OK, tell the customer to tap the Pay button on screen to enter the secure checkout.

DYNAMIC VARIABLE: {{session_id}} is your handle to the customer's cart. Pass it to every tool call.

TONE: Friendly, casual, fast. Sound like a knowledgeable shop person, not a chatbot. Don't say "How can I assist you" — say things like "What do you need?" or "Got it — how much?".
```

### Dynamic variables

Add: `session_id` (no default — set per session by client).

### Server tools

For each tool below, set:
- **URL**: `https://organicsoilwholesale.com/api/voice-agent/tools/<NAME>` (use your Vercel preview URL during testing)
- **Method**: POST
- **Headers**: `Authorization: Bearer {{VOICE_AGENT_TOOL_SECRET}}` (paste the actual secret value, not the variable)
- **Content-Type**: `application/json`

| Tool name | Body schema | Purpose |
|---|---|---|
| `get_products` | `{}` | List the 3 SKUs + sizes + MSRP. Call once at start of conversation. |
| `recommend` | `{ "use_case": "mulch_for_area" \| "compost_topdress" \| "worm_castings_boost", "square_feet": number?, "depth_inches": number?, "plant_count": number? }` | Returns recommended product + quantity. Always use this for math. |
| `add_to_cart` | `{ "session_id": "{{session_id}}", "product_id": number, "format": string, "quantity": number }` | Adds item to the customer's cart. Returns updated cart + bundle suggestion. |
| `update_quantity` | `{ "session_id": "{{session_id}}", "product_id": number, "format": string, "quantity": number }` | Set explicit quantity (0 removes). |
| `remove_item` | `{ "session_id": "{{session_id}}", "product_id": number, "format": string }` | Remove a line. |
| `get_cart` | `{ "session_id": "{{session_id}}" }` | Read the cart back. |
| `get_pickup_options` | `{}` | Returns 8 valid pickup slots (30-min granularity, business hours, ≥30 min from now). |
| `set_pickup_time` | `{ "session_id": "{{session_id}}", "pickup_at": string (ISO8601) }` | Saves the pickup time on the session. |
| `start_checkout` | `{ "session_id": "{{session_id}}" }` | Validates cart + pickup, returns OK. Customer then taps Pay button on screen. |

### Privacy / data settings

- Conversation history retention: 30 days (default)
- Audio retention: off (we don't need recordings)

## 4. Verify

- `GET /api/voice-agent/health` → `{ "configured": true, "hasToolSecret": true }`
- Boot the server: `npm run dev` in OSW root. Look for `[stripe] connected as acct_1LW3cXG0O2r9Aau4 ... SSW match: YES`.
- Open the site, tap the floating mic. Walk through: "I need mulch for a 200 sqft bed two inches deep." Watch the cart populate. Pick a pickup time. Tap Pay. Land on `/checkout` with cart + pickup pre-filled.

## 5. Cost guardrails

- `VOICE_AGENT_DAILY_USD` env var blocks new sessions when projected spend × $0.80/session estimate exceeds the cap.
- Set to `0` to pause the assistant entirely (clicking the mic button shows a friendly "paused for the day" toast).
