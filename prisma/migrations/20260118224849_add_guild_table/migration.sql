-- CreateTable
CREATE TABLE `discovered_flyff_guilds` (
    `flyff_server_id` INTEGER NOT NULL,
    `flyff_guild_name` VARCHAR(64) NOT NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_discovered_guild_server_seen`(`flyff_server_id`, `last_seen_at`),
    INDEX `idx_discovered_guild_server_name`(`flyff_server_id`, `flyff_guild_name`),
    PRIMARY KEY (`flyff_server_id`, `flyff_guild_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
