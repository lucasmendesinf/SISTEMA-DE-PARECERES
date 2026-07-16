<?php
declare(strict_types=1);

function ai_usage_decimal(float $value, int $scale = 10): string
{
    return number_format($value, $scale, '.', '');
}

function ai_usage_extract_tokens(?array $usage): array
{
    if (!is_array($usage)) {
        return [
            'has_usage' => false,
            'prompt_tokens' => null,
            'cached_tokens' => null,
            'completion_tokens' => null,
            'total_tokens' => null,
        ];
    }

    $prompt = $usage['prompt_tokens'] ?? $usage['input_tokens'] ?? null;
    $completion = $usage['completion_tokens'] ?? $usage['output_tokens'] ?? null;
    $total = $usage['total_tokens'] ?? null;
    $cached = $usage['prompt_tokens_details']['cached_tokens']
        ?? $usage['input_tokens_details']['cached_tokens']
        ?? null;

    return [
        'has_usage' => true,
        'prompt_tokens' => is_numeric($prompt) ? max(0, (int) $prompt) : null,
        'cached_tokens' => is_numeric($cached) ? max(0, (int) $cached) : null,
        'completion_tokens' => is_numeric($completion) ? max(0, (int) $completion) : null,
        'total_tokens' => is_numeric($total) ? max(0, (int) $total) : null,
    ];
}

function ai_usage_calculate_costs(array $tokens, ?array $price, float $exchangeRate): array
{
    if (array_key_exists('has_usage', $tokens) && empty($tokens['has_usage'])) {
        return [
            'price_found' => (bool) $price,
            'input_cost_usd' => null,
            'output_cost_usd' => null,
            'cached_input_cost_usd' => null,
            'total_cost_usd' => null,
            'total_cost_brl' => null,
        ];
    }

    if (!$price) {
        return [
            'price_found' => false,
            'input_cost_usd' => null,
            'output_cost_usd' => null,
            'cached_input_cost_usd' => null,
            'total_cost_usd' => null,
            'total_cost_brl' => null,
        ];
    }

    $promptTokens = max(0, (int) ($tokens['prompt_tokens'] ?? 0));
    $completionTokens = max(0, (int) ($tokens['completion_tokens'] ?? 0));
    $cachedTokens = max(0, (int) ($tokens['cached_tokens'] ?? 0));
    $inputPrice = (float) ($price['input_price_per_million'] ?? 0);
    $outputPrice = (float) ($price['output_price_per_million'] ?? 0);
    $cachedPrice = (float) ($price['cached_input_price_per_million'] ?? 0);

    $inputCost = ($promptTokens / 1000000) * $inputPrice;
    $outputCost = ($completionTokens / 1000000) * $outputPrice;
    $cachedCost = ($cachedTokens / 1000000) * $cachedPrice;
    $totalCost = $inputCost + $outputCost + $cachedCost;

    return [
        'price_found' => true,
        'input_cost_usd' => ai_usage_decimal($inputCost),
        'output_cost_usd' => ai_usage_decimal($outputCost),
        'cached_input_cost_usd' => ai_usage_decimal($cachedCost),
        'total_cost_usd' => ai_usage_decimal($totalCost),
        'total_cost_brl' => ai_usage_decimal($totalCost * max(0, $exchangeRate)),
    ];
}

function ai_usage_month_cycle(?DateTimeImmutable $now = null): array
{
    $now = $now ?: new DateTimeImmutable('now');
    return [
        'key' => $now->format('Y-m'),
        'start' => $now->modify('first day of this month')->format('Y-m-d 00:00:00'),
        'end' => $now->modify('first day of next month')->format('Y-m-d 00:00:00'),
    ];
}
