CREATE TABLE `guild_member_snapshot` (
    `flyff_server_id` INTEGER NOT NULL,
    `flyff_guild_name` VARCHAR(64) NOT NULL,
    `player_id` VARCHAR(32) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `rank` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `job` VARCHAR(32) NOT NULL,
    `playtime` VARCHAR(32) NULL,
    `server_text` VARCHAR(64) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_guild_members_rank`(`flyff_server_id`, `flyff_guild_name`, `rank`),
    INDEX `idx_guild_members_player`(`flyff_server_id`, `player_id`),
    PRIMARY KEY (`flyff_server_id`, `flyff_guild_name`, `player_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `guild_member_snapshot` (
    `flyff_server_id`,
    `flyff_guild_name`,
    `player_id`,
    `username`,
    `rank`,
    `level`,
    `job`,
    `playtime`,
    `server_text`,
    `updated_at`
)
SELECT
    `flyff_server_id`,
    `flyff_guild_name`,
    `player_id`,
    `username`,
    `rank`,
    `level`,
    `job`,
    `playtime`,
    `server_text`,
    `updated_at`
FROM `ranking_snapshot`
WHERE `flyff_guild_name` IS NOT NULL AND TRIM(`flyff_guild_name`) <> '';
