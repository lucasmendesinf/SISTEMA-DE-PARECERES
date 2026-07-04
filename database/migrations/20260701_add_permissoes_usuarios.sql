ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil ENUM('master','cliente') NOT NULL DEFAULT 'cliente' AFTER telefone;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSON NULL AFTER perfil;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo TINYINT(1) NOT NULL DEFAULT 1 AFTER permissoes;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS image_editor_permission ENUM('none','manual','ai','both') NOT NULL DEFAULT 'none' AFTER ativo;

UPDATE usuarios
SET perfil = 'master', ativo = 1
WHERE id = (
  SELECT id FROM (
    SELECT id FROM usuarios ORDER BY id LIMIT 1
  ) primeiro_usuario
);
