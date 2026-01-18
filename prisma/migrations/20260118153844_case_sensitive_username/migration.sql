-- Make username case-sensitive
ALTER TABLE `ranking_snapshot`
    MODIFY `username` VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NOT NULL;

-- Optional: make guild name case-sensitive too
ALTER TABLE `watched_flyff_guilds`
  MODIFY `flyff_guild_name` VARCHAR(64)
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_bin
  NOT NULL;