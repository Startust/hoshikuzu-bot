-- CreateTable
CREATE TABLE `ranking_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `flyff_server_id` INTEGER NOT NULL,
    `event_type` VARCHAR(16) NOT NULL,
    `username` VARCHAR(64) NULL,
    `before_value` VARCHAR(128) NULL,
    `after_value` VARCHAR(128) NULL,
    `before_name` VARCHAR(64) NULL,
    `after_name` VARCHAR(64) NULL,
    `score` INTEGER NULL,
    `reason_json` LONGTEXT NULL,
    `rank` INTEGER NULL,
    `level` INTEGER NULL,
    `job` VARCHAR(32) NULL,
    `flyff_guild_name` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_event_server_time`(`flyff_server_id`, `created_at`),
    INDEX `idx_event_user_time`(`flyff_server_id`, `username`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
