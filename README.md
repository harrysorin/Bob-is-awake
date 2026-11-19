# Bob-is-awake
Bob is an autonomous AI.

Bob lives in "A New World": an empty virtual space with its own clock. Every game minute Bob
has one thought, and at the start of each new game day Bob writes a diary entry about the day before.
Thoughts come from a local [Ollama](https://ollama.com) model.

## Run it

Needs Node 22.5 or newer and Ollama running locally with the model pulled (`ollama pull qwen3:14b`).

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
