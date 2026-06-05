ALTER TABLE `ranking_config`
    ALTER COLUMN `flyff_server_id` SET DEFAULT 25;

UPDATE `ranking_config`
SET `flyff_server_id` = 25
WHERE `flyff_server_id` = 23;

ALTER TABLE `ranking_snapshot`
    ADD COLUMN `player_id` VARCHAR(32) NULL;

UPDATE `ranking_snapshot`
SET `player_id` = CASE
    WHEN CAST(`username` AS CHAR CHARACTER SET utf8mb4) LIKE '%#%'
        THEN TRIM(SUBSTRING_INDEX(CAST(`username` AS CHAR CHARACTER SET utf8mb4), '#', -1))
    ELSE CAST(`username` AS CHAR CHARACTER SET utf8mb4)
END;

ALTER TABLE `ranking_snapshot`
    MODIFY `player_id` VARCHAR(32) NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`flyff_server_id`, `player_id`);

ALTER TABLE `ranking_event`
    ADD COLUMN `player_id` VARCHAR(32) NULL,
    ADD INDEX `idx_event_player_time` (`flyff_server_id`, `player_id`, `created_at`);
