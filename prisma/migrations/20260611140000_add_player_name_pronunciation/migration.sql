CREATE TABLE `player_name_pronunciation` (
    `username` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `audio_url` VARCHAR(768) NULL,
    `audio_format` VARCHAR(16) NULL DEFAULT 'wav',
    `tts_text` VARCHAR(256) NULL,
    `source_hash` VARCHAR(64) NULL,
    `generated_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `failed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `idx_pronunciation_generated_at` (`generated_at`),
    INDEX `idx_pronunciation_failed_at` (`failed_at`),
    PRIMARY KEY (`username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
