import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Pool } from 'mariadb';
import type * as Undici from 'undici';
import { MockAgent, setGlobalDispatcher } from 'undici';

import { diffByPlayerId } from '../src/services/flyffRanking/diff.js';
import { fetchAllPlayers, parsePlayerName } from '../src/services/flyffRanking/scrape.js';
import type { PlayerRow } from '../src/services/flyffRanking/store.js';

const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
after(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
});
const origin = agent.get('https://universe.flyff.com');
const row = (name: string, guild: string, rank = '2') =>
  `<tr><td>${rank}</td><td>${name}<img alt="badge"></td><td>160</td><td>Slayer #1</td><td>${guild}</td><td>100h</td><td>Server</td></tr>`;

test('scraper fetches fixture pages and preserves stable IDs, unicode and medal ranks', async () => {
  origin
    .intercept({ path: '/sniegu/ranking/characters?server=25' })
    .reply(
      200,
      `<a>2</a><table><tbody>${row(' 星屑 #abc123 ', 'Hoshi', '<img alt="Medal first">')}</tbody></table>`,
    );
  origin
    .intercept({ path: '/sniegu/ranking/characters?server=25&page=2' })
    .reply(
      200,
      `<table><tbody>${row('New Name #xyz', 'Other')}<tr><td>invalid</td></tr></tbody></table>`,
    );
  const players = await fetchAllPlayers(25);
  assert.equal(players.length, 2);
  assert.deepEqual(players[0], {
    playerId: 'abc123',
    username: '星屑',
    rank: 1,
    level: 160,
    job: 'Slayer',
    flyffGuildName: 'Hoshi',
    playtime: '100h',
    serverText: 'Server',
  });
  assert.equal(players[1]?.playerId, 'xyz');
});

test('scraper rejects HTTP errors and unmocked network access', async () => {
  origin
    .intercept({ path: '/sniegu/ranking/characters?server=999' })
    .reply(503, 'offline');
  await assert.rejects(fetchAllPlayers(999), /HTTP 503/);
  await assert.rejects(fetchAllPlayers(998), /fetch failed/);
});

test('rename and guild transfers use IDs and watched guild scope', () => {
  const oldMap = new Map<string, PlayerRow>([
    ['id1', { playerId: 'id1', username: 'Old', flyffGuildName: 'Hoshi' } as PlayerRow],
  ]);
  const latest = [
    {
      playerId: 'id1',
      username: 'New',
      flyffGuildName: 'Other',
      rank: 1,
      level: 160,
      job: 'Slayer',
      playtime: '1h',
      serverText: 'Server',
    },
  ];
  assert.deepEqual(
    diffByPlayerId(oldMap, latest, new Set(['Hoshi'])).map((c) => c.type),
    ['rename', 'guild'],
  );
  assert.deepEqual(diffByPlayerId(oldMap, latest, new Set(['Unwatched'])), []);
  assert.deepEqual(parsePlayerName(' name without id '), {
    username: 'name without id',
    playerId: 'name without id',
  });
});

test('Discord builders serialize pronunciation links without a client or token', () => {
  const button = new ButtonBuilder()
    .setLabel('Pronunciation')
    .setStyle(ButtonStyle.Link)
    .setURL('https://example.invalid/audio.wav?v=123');
  const json = new ActionRowBuilder<ButtonBuilder>().addComponents(button).toJSON();
  assert.equal(json.components[0]?.style, ButtonStyle.Link);
});

test('Discord uses patched Undici 6 and its fetch works with a separate mock dispatcher', async () => {
  const require = createRequire(import.meta.url);
  const discordRequire = createRequire(require.resolve('discord.js'));
  const undici = discordRequire('undici') as typeof Undici;
  assert.equal(discordRequire('undici/package.json').version, '6.28.1');
  const mock = new undici.MockAgent();
  mock.disableNetConnect();
  mock
    .get('https://example.invalid')
    .intercept({ path: '/fixture' })
    .reply(200, { ok: true });
  try {
    const response = await undici.fetch('https://example.invalid/fixture', {
      dispatcher: mock,
    });
    assert.deepEqual(await response.json(), { ok: true });
    mock.assertNoPendingInterceptors();
  } finally {
    await mock.close();
  }
});

test('MariaDB adapter keeps SQL values separate using a fake pool', async () => {
  const calls: unknown[][] = [];
  let ended = false;
  const pool = {
    getConnection: async () => {
      throw new Error('unexpected connection');
    },
    query: async () => [['10.11.9-MariaDB']],
    execute: async (...args: unknown[]) => {
      calls.push(args);
      return Object.assign([], { affectedRows: 1 });
    },
    end: async () => {
      ended = true;
    },
  } as unknown as Pool;
  const adapter = await new PrismaMariaDb(pool, {
    database: 'fixture',
    disposeExternalPool: true,
  }).connect();
  const changed = await adapter.executeRaw({
    sql: 'UPDATE fixture SET username = ?',
    args: ["O'Reilly"],
    argTypes: [{ scalarType: 'string', dbType: 'VARCHAR', arity: 'scalar' }],
  });
  assert.equal(changed, 1);
  assert.deepEqual(calls[0]?.[1], ["O'Reilly"]);
  assert.equal((calls[0]?.[0] as { sql: string }).sql, 'UPDATE fixture SET username = ?');
  await adapter.dispose();
  assert.equal(ended, true);
});
