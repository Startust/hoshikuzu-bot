-- CreateTable
CREATE TABLE `page_cache` (
    `url` VARCHAR(768) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `title` VARCHAR(512) NULL,
    `text` LONGTEXT NOT NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ttl_ms` INTEGER NOT NULL,

    INDEX `idx_page_cache_source`(`source`),
    PRIMARY KEY (`url`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_cache` (
    `source` VARCHAR(64) NOT NULL,
    `query` VARCHAR(512) NOT NULL,
    `results_json` LONGTEXT NOT NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ttl_ms` INTEGER NOT NULL,

    INDEX `idx_search_cache_source`(`source`),
    PRIMARY KEY (`source`, `query`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
