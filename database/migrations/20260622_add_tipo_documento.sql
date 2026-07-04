-- Executar uma vez em bases que já tinham a tabela pareceres criada.
ALTER TABLE pareceres
  ADD COLUMN IF NOT EXISTS tipo_documento ENUM('parecer','portfolio') NOT NULL DEFAULT 'parecer' AFTER texto;

ALTER TABLE pareceres
  ADD UNIQUE KEY uq_parecer_crianca_periodo_tipo (crianca_id, periodo_id, tipo_documento);
ALTER TABLE pareceres DROP INDEX uq_parecer_crianca_periodo;
