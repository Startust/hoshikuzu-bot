ALTER TABLE `discovered_flyff_guilds`
    MODIFY `flyff_guild_name` VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NOT NULL;