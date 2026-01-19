import { prisma } from '../db/prisma';

export async function isGuildAllowed(guildId: string): Promise<boolean> {
  const row = await prisma.guildAllowlist.findUnique({
    where: { discordGuildId: guildId },
    select: { discordGuildId: true },
  });
  return !!row;
}

export async function addGuildToAllowlist(guildId: string, note?: string) {
  return prisma.guildAllowlist.upsert({
    where: { discordGuildId: guildId },
    create: {
      discordGuildId: guildId,
      note: note ?? null,
    },
    update: {
      note: note ?? null,
    },
  });
}

export async function removeGuildFromAllowlist(guildId: string) {
  await prisma.guildAllowlist
    .delete({ where: { discordGuildId: guildId } })
    .catch(() => {});
}

export async function listAllowedGuilds() {
  return prisma.guildAllowlist.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      discordGuildId: true,
      note: true,
      createdAt: true,
    },
  });
}
