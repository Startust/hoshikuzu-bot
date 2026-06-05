import * as cheerio from 'cheerio';
import { fetch } from 'undici';

export type ScrapedPlayer = {
  playerId: string;
  username: string;
  rank: number;
  level: number;
  job: string;
  flyffGuildName: string;
  playtime: string;
  serverText: string;
};

const BASE = 'https://universe.flyff.com/sniegu/ranking/characters';

function buildUrl(serverId: number, page: number) {
  const u = new URL(BASE);
  u.searchParams.set('server', String(serverId));
  if (page > 1) u.searchParams.set('page', String(page));
  return u.toString();
}

function normalize(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

export function parsePlayerName(rawName: string) {
  const value = normalize(rawName);
  const match = /^(.*?)\s*#\s*([0-9]+)\s*$/u.exec(value);

  if (!match) {
    return { username: value, playerId: value };
  }

  return {
    username: normalize(match[1] ?? value),
    playerId: match[2] ?? value,
  };
}

function parseMaxPage($: cheerio.CheerioAPI) {
  let max = 1;
  $('a').each((_, a) => {
    const t = normalize($(a).text());
    const n = Number(t);
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return max;
}

/**
 * ⚠️ 这里的 selector 需要你根据实际 DOM 校准
 * 先用 /rank now 输出前几条，确认是否能抓到 username/guild。
 */
function parsePlayersFromHtml(html: string): {
  players: ScrapedPlayer[];
  maxPage: number;
} {
  const $ = cheerio.load(html);

  const maxPage = parseMaxPage($);
  const players: ScrapedPlayer[] = [];

  const rows = $('table tbody tr');
  rows.each((_, tr) => {
    const cells = $(tr).find('th, td'); // ✅ 关键：包含 th

    if (cells.length < 7) return;

    const rankCell = $(cells[0]);
    let rank: number | null = null;

    // rank 可能是 <img alt="Medal first"> 或纯数字
    const rankText = normalize(rankCell.text());
    if (rankText) {
      rank = Number(rankText) || null;
    } else {
      const medalAlt = rankCell.find('img[alt]').attr('alt')?.toLowerCase() ?? '';
      if (medalAlt.includes('first')) rank = 1;
      else if (medalAlt.includes('second')) rank = 2;
      else if (medalAlt.includes('third')) rank = 3;
    }

    const rawName = normalize($(cells[1]).clone().children().remove().end().text());
    // 上面这句：把 name 单元格里的 img/badge 去掉，只留纯文本名字
    const { username, playerId } = parsePlayerName(rawName);

    const level = Number(normalize($(cells[2]).text())) || null;

    // job 单元格里有 "Slayer #1" 这种，取纯文本去掉 #排名也可以
    const jobRaw = normalize($(cells[3]).text());
    const job = jobRaw.replace(/#\d+/g, '').trim() || null;

    const guild = normalize($(cells[4]).text()) || null;
    const playtime = normalize($(cells[5]).text()) || null;
    const serverText = normalize($(cells[6]).text()) || null;

    if (!username || !playerId) return;

    players.push({
      playerId,
      username,
      rank: rank ?? 0,
      level: level ?? 0,
      job: job ?? '',
      flyffGuildName: guild ?? '',
      playtime: playtime ?? '',
      serverText: serverText ?? '',
    });
  });

  return { players, maxPage };
}

async function getHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'hoshikuzu-bot/1.0',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

export async function fetchAllPlayers(serverId: number): Promise<ScrapedPlayer[]> {
  const firstHtml = await getHtml(buildUrl(serverId, 1));
  const first = parsePlayersFromHtml(firstHtml);

  const all = [...first.players];
  for (let page = 2; page <= first.maxPage; page++) {
    const html = await getHtml(buildUrl(serverId, page));
    const { players } = parsePlayersFromHtml(html);
    all.push(...players);
    await new Promise((r) => setTimeout(r, 250));
  }
  return all;
}
