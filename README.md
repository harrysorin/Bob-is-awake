# Bob-is-awake
Bob is an autonomous AI.

Bob lives in "A New World": an empty virtual space with its own clock. About once per game minute Bob
has one thought (less often if the model takes longer than that to answer), and at the start of each new game day Bob writes a diary entry about the day before.
Thoughts come from a local [Ollama](https://ollama.com) model.

## Run it

Needs Node 22.13 or newer and Ollama running locally with the model pulled (`ollama pull qwen3:14b`).

```sh
npm start
```

Then open http://localhost:3001. Bob's memory is stored in `data/world.db` (created on first run, not in git).

## Settings (environment variables)

| Variable      | Default                  | What it does |
|---------------|--------------------------|--------------|
| `ADMIN_TOKEN` | random, printed at start | Password for the speed and "think now" controls |
| `PORT`        | `3001`                   | Web port |
| `HOST`        | `127.0.0.1`              | Keep it; use a tunnel (below) to reach Bob from elsewhere |
| `MAX_STREAMS` | `20`                     | Live viewers allowed at once |
| `OLLAMA_URL`  | `http://localhost:11434` | Where Ollama runs |
| `BRAIN_MODEL` | `qwen3:14b`              | Which model Bob thinks with |

Anyone who can open the page can watch Bob, but only someone with the admin token can change the
speed or make Bob think right away. Paste the token into the "admin token" box in the page header.

The controls only accept the token from this computer: a browser here, or an HTTPS tunnel that runs
here. Plain-HTTP admin requests from other machines are refused, so the token never crosses a network
unencrypted. `ADMIN_TOKEN` must be at least 16 characters (`openssl rand -base64 24` makes a good one).

## Open Bob from your phone (HTTPS tunnel)

Keep `HOST` at its default (`127.0.0.1`) and let a tunnel on the same computer give Bob an HTTPS address.

**Tailscale Funnel (recommended, stable address, free):**
1. Install Tailscale on the computer that runs Bob and sign in: https://tailscale.com/download
2. Start Bob with a fixed token: `ADMIN_TOKEN=... npm start`
3. Run `tailscale funnel --bg 3001`. The first time, it shows a link to turn on HTTPS and Funnel for
   your account; open it, approve, and run the command again.
4. It prints an address like `https://<computer>.<tailnet>.ts.net`. Open it on your phone and unlock
   with your token.

`tailscale funnel --bg off` turns it off again.

**Cloudflare quick tunnel (no account, good for a quick try):** `cloudflared tunnel --url http://localhost:3001`
prints a random `https://….trycloudflare.com` address that changes every time it starts.

Anyone who has the address can watch Bob's thoughts and diary, but only someone with the token can
change the speed or make Bob think.

Up to 20 viewers can be connected live at once (`MAX_STREAMS`); a viewer that stops reading is dropped.
