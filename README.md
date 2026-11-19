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
| `HOST`        | `127.0.0.1`              | Set to `0.0.0.0` to open the page to other machines |
| `OLLAMA_URL`  | `http://localhost:11434` | Where Ollama runs |
| `BRAIN_MODEL` | `qwen3:14b`              | Which model Bob thinks with |

Anyone who can open the page can watch Bob, but only someone with the admin token can change the
speed or make Bob think right away. Paste the token into the "admin token" box in the page header.

The token travels over plain HTTP. That's fine on your own computer (the default). If you set
`HOST=0.0.0.0` to reach Bob from other machines, put it behind HTTPS (for example a reverse proxy)
so nobody on the network can read the token.
