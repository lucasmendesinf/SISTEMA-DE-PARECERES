<?php
// Interpreta o "texto final" do documento. Pode ser texto simples (blocos separados
// por linha em branco) ou HTML simples gerado pelo editor (paragrafos <p> e <img>).
// Retorna uma lista de blocos: ['type'=>'text','text'=>...] ou ['type'=>'image','src'=>data-url].
function finalTextBlocks(string $value): array
{
    $value = trim($value);
    if ($value === '') return [];
    $blocks = [];
    if (!preg_match('/<(p|div|br|img)\b/i', $value)) {
        foreach (preg_split('/\R{2,}/u', $value) ?: [] as $block) {
            $block = trim(preg_replace('/\s+/u', ' ', $block));
            if ($block !== '') $blocks[] = ['type' => 'text', 'text' => $block];
        }
        return $blocks;
    }
    $dom = new DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8"><body>' . $value . '</body>', LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body) return [];
    $buffer = '';
    $flush = static function () use (&$buffer, &$blocks): void {
        $text = trim(preg_replace('/\s+/u', ' ', $buffer));
        if ($text !== '') $blocks[] = ['type' => 'text', 'text' => $text];
        $buffer = '';
    };
    $walk = static function (DOMNode $node) use (&$walk, &$buffer, &$blocks, $flush): void {
        foreach ($node->childNodes as $child) {
            if ($child->nodeType === XML_TEXT_NODE) {
                $buffer .= $child->nodeValue;
            } elseif ($child instanceof DOMElement) {
                $tag = strtolower($child->tagName);
                if ($tag === 'img') {
                    $flush();
                    $src = (string) $child->getAttribute('src');
                    if (preg_match('#^data:image/(?:jpeg|jpg|png|webp|gif);base64,#i', $src)) $blocks[] = ['type' => 'image', 'src' => $src];
                } elseif ($tag === 'br') {
                    $flush();
                } elseif (in_array($tag, ['p', 'div', 'li', 'h1', 'h2', 'h3'], true)) {
                    $flush();
                    $walk($child);
                    $flush();
                } else {
                    $walk($child);
                }
            }
        }
    };
    $walk($body);
    $flush();
    return $blocks;
}
