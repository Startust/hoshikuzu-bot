/*
  Warnings:

  - The primary key for the `page_cache` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `fetched_at` on the `page_cache` table. All the data in the column will be lost.
  - You are about to drop the column `ttl_ms` on the `page_cache` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[url]` on the table `page_cache` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `page_cache` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `ttlMs` to the `page_cache` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `page_cache` DROP PRIMARY KEY,
    DROP COLUMN `fetched_at`,
    DROP COLUMN `ttl_ms`,
    ADD COLUMN `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `id` VARCHAR(191) NOT NULL,
    ADD COLUMN `ttlMs` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `doc_chunk` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `url` VARCHAR(768) NOT NULL,
    `title` VARCHAR(512) NULL,
    `chunkIdx` INTEGER NOT NULL,
    `content` LONGTEXT NOT NULL,
    `keywords` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_doc_chunk_source`(`source`),
    INDEX `idx_doc_chunk_url`(`url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `page_cache_url_key` ON `page_cache`(`url`);
