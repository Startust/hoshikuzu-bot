import { prisma } from '../db/prisma.js';

export type PronunciationUrlMap = Map<string, string>;

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

export async function listPronunciationUrls(
  names: Array<string | null | undefined>,
): Promise<PronunciationUrlMap> {
  const uniqueNames = Array.from(
    new Set(names.map(normalizeName).filter((name): name is string => !!name)),
  );

  if (!uniqueNames.length) return new Map();

  const rows = await prisma.playerNamePronunciation.findMany({
    where: {
      username: { in: uniqueNames },
      audioUrl: { not: null },
    },
    select: {
      username: true,
      audioUrl: true,
    },
  });

  return new Map(
    rows
      .filter((row): row is { username: string; audioUrl: string } => !!row.audioUrl)
      .map((row) => [row.username, row.audioUrl]),
  );
}
