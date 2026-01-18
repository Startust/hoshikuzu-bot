-- ===============================
-- ranking_event (if exists)
-- ===============================

ALTER TABLE `ranking_event`
    MODIFY `username` VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NULL;

ALTER TABLE `ranking_event`
    MODIFY `before_name` VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NULL;

ALTER TABLE `ranking_event`
    MODIFY `after_name` VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_bin
    NULL;