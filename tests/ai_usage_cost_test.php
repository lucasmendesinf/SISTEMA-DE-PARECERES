<?php
declare(strict_types=1);

require_once __DIR__ . '/../ai_usage_helpers.php';

function assertSameValue($expected, $actual, string $message): void
{
    if ((string) $expected !== (string) $actual) {
        fwrite(STDERR, "FAIL: {$message}\nExpected: {$expected}\nActual: {$actual}\n");
        exit(1);
    }
}

function assertTrueValue(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$usage = [
    'prompt_tokens' => 1200,
    'completion_tokens' => 800,
    'total_tokens' => 2000,
    'prompt_tokens_details' => ['cached_tokens' => 0],
];
$tokens = ai_usage_extract_tokens($usage);
$price = [
    'input_price_per_million' => '0.59',
    'output_price_per_million' => '0.79',
    'cached_input_price_per_million' => '0.00',
];
$costs = ai_usage_calculate_costs($tokens, $price, 5.50);

assertSameValue('0.0007080000', $costs['input_cost_usd'], 'calcula custo de entrada');
assertSameValue('0.0006320000', $costs['output_cost_usd'], 'calcula custo de saida');
assertSameValue('0.0013400000', $costs['total_cost_usd'], 'calcula custo total');
assertSameValue('0.0073700000', $costs['total_cost_brl'], 'converte para BRL');
assertSameValue(1200, $tokens['prompt_tokens'], 'extrai prompt_tokens oficial');
assertSameValue(800, $tokens['completion_tokens'], 'extrai completion_tokens oficial');
assertSameValue(2000, $tokens['total_tokens'], 'extrai total_tokens oficial');

$small = ai_usage_calculate_costs(['prompt_tokens' => 1, 'completion_tokens' => 1, 'cached_tokens' => 0], $price, 5.50);
assertSameValue('0.0000013800', $small['total_cost_usd'], 'mantem precisao para valores pequenos');

$withoutPrice = ai_usage_calculate_costs($tokens, null, 5.50);
assertTrueValue($withoutPrice['price_found'] === false, 'modelo sem preco fica pendente');
assertSameValue('', (string) $withoutPrice['total_cost_usd'], 'modelo sem preco nao vira custo zero confirmado');

$withoutUsage = ai_usage_extract_tokens(null);
assertTrueValue($withoutUsage['has_usage'] === false, 'resposta sem usage nao inventa tokens');
$withoutUsageCost = ai_usage_calculate_costs($withoutUsage, $price, 5.50);
assertSameValue('', (string) $withoutUsageCost['total_cost_usd'], 'resposta sem usage nao confirma custo zero');

$groqStyle = ai_usage_extract_tokens([
    'input_tokens' => 4641,
    'input_tokens_details' => ['cached_tokens' => 4608],
    'output_tokens' => 1817,
    'total_tokens' => 6458,
]);
assertSameValue(4608, $groqStyle['cached_tokens'], 'extrai cached_tokens do formato Groq detalhado');

$changedPrice = [
    'input_price_per_million' => '1.00',
    'output_price_per_million' => '2.00',
    'cached_input_price_per_million' => '0.00',
];
$oldSnapshot = $costs;
$newCosts = ai_usage_calculate_costs($tokens, $changedPrice, 5.50);
assertSameValue('0.0013400000', $oldSnapshot['total_cost_usd'], 'snapshot historico permanece igual apos mudanca de preco');
assertSameValue('0.0028000000', $newCosts['total_cost_usd'], 'novo preco altera apenas novas requisicoes');

$cycle = ai_usage_month_cycle(new DateTimeImmutable('2026-07-16 12:00:00'));
assertSameValue('2026-07', $cycle['key'], 'identifica ciclo mensal');

echo "OK: ai_usage_cost_test\n";
