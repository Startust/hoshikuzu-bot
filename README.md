# Hoshikuzu Bot

Discord bot for Hoshikuzu Flyff Universe guild monitoring and lookup.

## Features

- Slash commands for Flyff guild management:
  - `/guild watch name:<guild>` follows a Flyff guild.
  - `/guild unwatch name:<guild>` removes a followed guild.
  - `/guild list` shows followed guilds.
  - `/guild history name:<guild>` shows recent join, leave, transfer, and rename history.
  - `/guild player-history name:<player>` shows a player's join, leave, transfer, and rename history.
  - `/guild members name:<guild>` shows the current ranking-backed member list.
  - `/rank channel target:<channel>` sets the notification channel.
- Periodic Flyff ranking polling.
  - Fetches configured Flyff server rankings.
  - Dedupe players by player id before diffing.
  - Records ranking snapshots, guild member snapshots, and ranking events.
  - Sends guild join, leave, transfer, and rename notifications to configured channels.
- Player-name pronunciation support.
  - Guild notifications include a `発音を聞く` link button when audio exists.
  - Rename notifications can include separate before/after pronunciation buttons.
  - Member lists replace rank/playtime with compact `🔊` pronunciation links.
  - Links are shown only for names that already have generated audio.
- Local TTS batch pipeline under `local-tts/`.
  - Generates pronunciation wav files locally with VoxCPM.
  - Uploads audio to S3 and writes public URLs into `player_name_pronunciation`.
  - Uses cache-busting URL versions (`?v=<source_hash>`) so regenerated audio is not hidden by long browser or Discord caches.
  - Converts Chinese names to pinyin phoneme input.
  - Converts likely Japanese names to katakana readings with SudachiPy.
  - Keeps Hangul and kana-heavy names readable instead of forcing Chinese pinyin.

## Architecture

- Runtime: Node.js, Sapphire Framework, Discord.js.
- Database: MySQL through Prisma.
- Ranking data:
  - `ranking_snapshot`
  - `guild_member_snapshot`
  - `ranking_event`
  - `ranking_config`
  - `watched_flyff_guilds`
  - `discovered_flyff_guilds`
- Pronunciation data:
  - `player_name_pronunciation`
- Local-only TTS assets:
  - `local-tts/.venv`
  - `local-tts/data/audio`
  - `local-tts/data/models`
  - `local-tts/data/reference`
  - `local-tts/logs`

Those local TTS runtime directories are ignored by git.

## Setup

Install Node dependencies:

```powershell
yarn install
```

Configure environment variables in `.env`:

```dotenv
DISCORD_TOKEN=
CLIENT_ID=
ALLOWLIST_ADMIN_GUILD_ID=
DEV_GUILD_ID=
OPENAI_API_KEY=

DATABASE_URL=
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_NAME=
DATABASE_HOST=
DATABASE_PORT=
```

Generate Prisma client:

```powershell
yarn prisma:generate
```

Apply migrations:

```powershell
yarn prisma:migrate:deploy
```

Run the bot locally:

```powershell
yarn dev
```

Run production entrypoint:

```powershell
yarn start
```

## Local TTS

The TTS batch is intentionally local because it uses GPU-backed VoxCPM and a local Windows scheduled task.

See [local-tts/README.md](local-tts/README.md) for:

- first-time Python setup
- S3 upload settings
- pronunciation rules
- scheduled task install/uninstall
- cache-busting URL behavior

## Validation

Useful checks before shipping:

```powershell
npm exec tsc -- --noEmit
npm run lint
.\local-tts\.venv\Scripts\python.exe -m py_compile .\local-tts\generate_pronunciations.py
```
