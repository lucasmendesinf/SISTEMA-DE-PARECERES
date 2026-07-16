# Monitoramento de Consumo de IA

## Objetivo

O painel **Consumo de Inteligencia Artificial** registra o consumo estimado da API Groq usada no fluxo de revisao de textos pedagogicos. O valor exibido e uma estimativa calculada pelo iProf e pode diferir da cobranca final da Groq por descontos, cache, creditos, ajustes de faturamento, mudancas de preco ou chamadas feitas fora do iProf.

## Arquivos criados

- `ai_usage_helpers.php`: funcoes puras para extracao de tokens, calculo de custo e ciclo mensal.
- `ai-usage-admin.js`: tela administrativa, filtros, graficos simples, tabela, exportacao CSV e formularios.
- `ai-usage-admin.css`: estilos do painel.
- `tests/ai_usage_cost_test.php`: testes unitarios sem chamada real de IA.
- `docs/ai-usage-monitoring.md`: esta documentacao.

## Arquivos alterados

- `api.php`: migrations, seed inicial de preco, endpoints internos e captura de uso na chamada Groq.
- `index.php`: inclusao do menu, CSS e JS do painel.

## Tabelas

### `ai_model_prices`

Guarda precos configuraveis por modelo. O registro ativo vigente e usado no momento da requisicao.

Campos principais: `provider`, `model_id`, `display_name`, `input_price_per_million`, `output_price_per_million`, `cached_input_price_per_million`, `currency`, `effective_from`, `effective_until`, `is_active`.

Seed inicial:

- Provedor: `Groq`
- Modelo: `llama-3.3-70b-versatile`
- Entrada: `US$ 0,59 / 1M tokens`
- Saida: `US$ 0,79 / 1M tokens`
- Cache: `US$ 0,00 / 1M tokens`

### `ai_usage_logs`

Registra uma linha por requisicao da IA, sem armazenar o texto completo do parecer.

Campos principais: `provider`, `model_id`, `request_id`, `external_request_id`, `user_id`, `school_hash`, `school_name`, `tenant_id`, `feature`, `operation`, `status`, tokens oficiais do objeto `usage`, snapshots de preco, custos em USD/BRL e duracao.

### `ai_usage_alerts`

Controla alertas por ciclo mensal para evitar repeticao: limite de 70%, 90%, 100%, modelo sem preco, resposta sem `usage` e rate limit.

## Formula

```text
input_cost_usd = (prompt_tokens / 1.000.000) * input_price_per_million
output_cost_usd = (completion_tokens / 1.000.000) * output_price_per_million
total_cost_usd = input_cost_usd + output_cost_usd + cached_input_cost_usd
total_cost_brl = total_cost_usd * cotacao_usd_brl
```

Os valores sao calculados sem arredondamento prematuro e salvos em `DECIMAL(20,10)`.

## Captura Groq

A captura esta centralizada no recurso `api.php?resource=ai-review`, no provedor `llama`, que usa endpoint OpenAI-compatible. Quando a URL base contem `groq.com`, o provedor registrado e `Groq`.

O sistema usa o objeto oficial `usage` retornado pela API. Quando `usage` nao vem, registra status `no_usage_data` e nao inventa tokens por quantidade de caracteres.

Streaming nao e usado nesse fluxo (`stream=false`), entao nao ha soma de fragmentos.

## Endpoints internos

Todos exigem login master.

- `GET api.php?resource=ai-usage`: resumo, series, agrupamentos, logs, precos, alertas e listas de filtro.
- `GET api.php?resource=ai-usage&action=export`: exporta CSV filtrado.
- `POST api.php?resource=ai-usage` com `action=settings`: salva cotacao, limite e alertas.
- `POST api.php?resource=ai-usage` com `action=price`: cria novo preco ativo e encerra o preco anterior.

## Configuracao

No menu master, acesse **Consumo IA**.

- Ajuste a cotacao USD/BRL.
- Ajuste limite mensal interno em USD.
- Configure percentuais de alerta.
- Escolha a acao ao atingir o limite: alertar, bloquear, fallback futuro ou continuar.
- Edite o preco do modelo usado.

## Validacao

Execute:

```powershell
C:\xampp\php\php.exe tests\ai_usage_cost_test.php
```

Tambem validar:

```powershell
C:\xampp\php\php.exe -l api.php
C:\xampp\php\php.exe -l ai_usage_helpers.php
node --check ai-usage-admin.js
```

## Limitacoes conhecidas

- O painel calcula somente chamadas feitas pelo iProf. Chamadas realizadas fora do sistema nao entram no relatorio.
- Nao ha consulta automatica ao faturamento oficial da Groq.
- A acao "trocar para outro modelo/provedor" fica registrada como opcao administrativa, mas o fluxo atual ainda bloqueia/alerta conforme configuracao existente.
- Os graficos usam HTML/CSS simples, seguindo o padrao visual atual, sem biblioteca externa.

## Rollback

Para rollback de codigo, reverta os arquivos alterados/criados. Para rollback de dados, as tabelas novas podem ser mantidas sem impactar o fluxo antigo; se precisar remover totalmente, exporte antes e remova `ai_usage_logs`, `ai_usage_alerts` e `ai_model_prices`.
