-- CreateTable
CREATE TABLE `ranking_config` (
    `discord_guild_id` VARCHAR(32) NOT NULL,
    `notify_channel_id` VARCHAR(32) NULL,
    `flyff_server_id` INTEGER NOT NULL DEFAULT 23,

    PRIMARY KEY (`discord_guild_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `watched_flyff_guilds` (
    `discord_guild_id` VARCHAR(32) NOT NULL,
    `flyff_guild_name` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`discord_guild_id`, `flyff_guild_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ranking_snapshot` (
    `flyff_server_id` INTEGER NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `rank` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `job` VARCHAR(32) NOT NULL,
    `flyff_guild_name` VARCHAR(64) NULL,
    `playtime` VARCHAR(32) NULL,
    `server_text` VARCHAR(64) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_server_rank`(`flyff_server_id`, `rank`),
    PRIMARY KEY (`flyff_server_id`, `username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
