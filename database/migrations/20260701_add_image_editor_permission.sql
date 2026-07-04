ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS image_editor_permission ENUM('none','manual','ai','both') NOT NULL DEFAULT 'none' AFTER ativo;
