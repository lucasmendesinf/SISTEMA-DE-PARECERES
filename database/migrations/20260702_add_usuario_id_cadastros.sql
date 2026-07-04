ALTER TABLE turmas ADD COLUMN IF NOT EXISTS usuario_id BIGINT UNSIGNED NULL AFTER id;
ALTER TABLE periodos_avaliativos ADD COLUMN IF NOT EXISTS usuario_id BIGINT UNSIGNED NULL AFTER id;
ALTER TABLE criancas ADD COLUMN IF NOT EXISTS usuario_id BIGINT UNSIGNED NULL AFTER id;
ALTER TABLE atividades ADD COLUMN IF NOT EXISTS usuario_id BIGINT UNSIGNED NULL AFTER id;

UPDATE turmas
SET usuario_id = (SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario)
WHERE usuario_id IS NULL;

UPDATE periodos_avaliativos
SET usuario_id = (SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario)
WHERE usuario_id IS NULL;

UPDATE criancas c
JOIN turmas t ON t.id = c.turma_id
SET c.usuario_id = t.usuario_id
WHERE c.usuario_id IS NULL;

UPDATE criancas
SET usuario_id = (SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario)
WHERE usuario_id IS NULL;

UPDATE atividades a
LEFT JOIN turmas t ON t.id = a.turma_id
SET a.usuario_id = COALESCE(t.usuario_id, (SELECT id FROM (SELECT id FROM usuarios ORDER BY id LIMIT 1) primeiro_usuario))
WHERE a.usuario_id IS NULL;
