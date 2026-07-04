CREATE TABLE IF NOT EXISTS parecer_blocos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parecer_id BIGINT UNSIGNED NOT NULL,
  ordem INT UNSIGNED NOT NULL DEFAULT 0,
  texto TEXT NULL,
  activity_ids TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parecer_blocos_parecer FOREIGN KEY (parecer_id) REFERENCES pareceres(id) ON DELETE CASCADE,
  INDEX idx_parecer_blocos_parecer_ordem (parecer_id, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'parecer_anexos'
    AND COLUMN_NAME = 'ordem'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE parecer_anexos ADD COLUMN ordem INT UNSIGNED NOT NULL DEFAULT 0 AFTER parecer_id',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
