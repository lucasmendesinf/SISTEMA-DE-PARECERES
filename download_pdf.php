<?php
declare(strict_types=1);

function iniBytes(string $value): int {
    $value = trim($value);
    if ($value === '') return 0;
    $unit = strtolower($value[strlen($value) - 1]);
    $number = (float) $value;
    if ($unit === 'g') return (int) ($number * 1024 * 1024 * 1024);
    if ($unit === 'm') return (int) ($number * 1024 * 1024);
    if ($unit === 'k') return (int) ($number * 1024);
    return (int) $number;
}

function rejectIncompletePdfPost(): void {
    $maxPost = iniBytes((string) ini_get('post_max_size'));
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $maxPost > 0 && $contentLength > $maxPost) {
        http_response_code(413);
        header('Content-Type: text/plain; charset=utf-8');
        exit('O PDF ficou muito grande para gerar. Reduza a quantidade de imagens ou tente novamente.');
    }
}

function pdfEscape(string $value): string {
    $value = iconv('UTF-8', 'Windows-1252//TRANSLIT', $value) ?: $value;
    return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', '', ''], $value);
}

function sanitizePdfFont(string $font): array {
    return match ($font) {
        'Times New Roman' => ['Times-Roman', 'Times-Bold'],
        'Courier New' => ['Courier', 'Courier-Bold'],
        default => ['Helvetica', 'Helvetica-Bold'],
    };
}

function sanitizeHexColorPdf(string $color, string $fallback = '253C31'): array {
    $hex = strtoupper(ltrim(trim($color), '#'));
    if (!preg_match('/^[0-9A-F]{6}$/', $hex)) $hex = $fallback;
    return [hexdec(substr($hex, 0, 2)) / 255, hexdec(substr($hex, 2, 2)) / 255, hexdec(substr($hex, 4, 2)) / 255];
}

final class PdfLayout {
    public array $pages = [];
    private int $page = -1;
    private float $bodySize;
    private float $bodyLeading;

    public function __construct(float $bodySize = 12) { $this->bodySize = $bodySize; $this->bodyLeading = max(15, $bodySize * 1.5); $this->newPage(); }
    public function newPage(): void { $this->pages[] = ['content' => '', 'y' => 800.0, 'images' => []]; $this->page = count($this->pages) - 1; }
    public function setY(float $y): void { $this->pages[$this->page]['y'] = $y; }
    public function y(): float { return $this->pages[$this->page]['y']; }
    public function ensure(float $height): void { if ($this->y() - $height < 40) $this->newPage(); }
    public function line(string $text, float $x = 36, float $size = 12, string $font = 'F1', float $leading = 18, ?array $color = null): void {
        $this->ensure($leading);
        $y = $this->y();
        $colorCmd = $color ? sprintf('%.3F %.3F %.3F rg ', $color[0], $color[1], $color[2]) : '0 0 0 rg ';
        $this->pages[$this->page]['content'] .= sprintf("BT /%s %.2F Tf %s%.2F %.2F Td (%s) Tj ET\n", $font, $size, $colorCmd, $x, $y, pdfEscape($text));
        $this->setY($y - $leading);
    }
    private function textWidth(string $text, float $size): float {
        $text = iconv('UTF-8', 'Windows-1252//TRANSLIT', $text) ?: $text;
        $width = 0.0;
        foreach (str_split($text) as $char) {
            if ($char === ' ') { $width += 0.28; continue; }
            if (str_contains('.,;:!|ijlI', $char)) { $width += 0.24; continue; }
            if (str_contains('mwMW@', $char)) { $width += 0.78; continue; }
            if (ctype_upper($char)) { $width += 0.62; continue; }
            $width += 0.50;
        }
        return $width * $size;
    }
    private function wrapTextToWidth(string $text, float $width, float $size): array {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?: '';
        if ($text === '') return [];
        $words = preg_split('/\s+/u', $text) ?: [];
        $lines = [];
        $line = '';
        foreach ($words as $word) {
            $candidate = $line === '' ? $word : $line . ' ' . $word;
            if ($line !== '' && $this->textWidth($candidate, $size) > $width) {
                $lines[] = $line;
                $line = $word;
                continue;
            }
            $line = $candidate;
        }
        if ($line !== '') $lines[] = $line;
        return $lines;
    }
    public function justifiedLine(string $text, float $x, float $width, float $size, string $font, float $leading): void {
        $this->ensure($leading);
        $y = $this->y();
        $words = preg_split('/\s+/u', trim($text)) ?: [];
        if (count($words) < 2) {
            $this->line($text, $x, $size, $font, $leading);
            return;
        }
        $wordWidths = array_map(fn(string $word): float => $this->textWidth($word, $size), $words);
        $normalSpace = $this->textWidth(' ', $size);
        $spaceCount = count($words) - 1;
        $extraSpace = max(0, ($width - array_sum($wordWidths) - ($normalSpace * $spaceCount)) / $spaceCount);
        $cursor = $x;
        foreach ($words as $index => $word) {
            $this->pages[$this->page]['content'] .= sprintf(
                "BT /%s %.2F Tf 0 0 0 rg %.2F %.2F Td (%s) Tj ET\n",
                $font,
                $size,
                $cursor,
                $y,
                pdfEscape($word)
            );
            $cursor += $wordWidths[$index] + $normalSpace + $extraSpace;
        }
        $this->setY($y - $leading);
    }
    public function centered(string $text, float $size = 12, string $font = 'F2', float $leading = 22, ?array $color = null): void {
        $width = strlen(pdfEscape($text)) * $size * 0.52;
        $this->line($text, max(36, (595 - $width) / 2), $size, $font, $leading, $color);
    }
    public function paragraph(string $text): void {
        $left = 85.0;
        $right = 57.0;
        $indent = 35.0;
        $bodyWidth = 595.0 - $left - $right;
        foreach (preg_split('/\R{2,}/u', trim($text)) ?: [] as $block) {
            $lines = $this->wrapTextToWidth($block, $bodyWidth - $indent, $this->bodySize);
            if (count($lines) > 1) {
                $rest = $this->wrapTextToWidth(implode(' ', array_slice($lines, 1)), $bodyWidth, $this->bodySize);
                $lines = [$lines[0], ...$rest];
            }
            $lastIndex = count($lines) - 1;
            foreach ($lines as $index => $line) {
                $x = $index === 0 ? $left + $indent : $left;
                $width = $index === 0 ? $bodyWidth - $indent : $bodyWidth;
                if ($index < $lastIndex) $this->justifiedLine($line, $x, $width, $this->bodySize, 'F1', $this->bodyLeading);
                else $this->line($line, $x, $this->bodySize, 'F1', $this->bodyLeading);
            }
            $this->setY($this->y() - 7);
        }
    }
    public function image(array $image, float $x, float $maxWidth, float $maxHeight, bool $center = false): void {
        $scale = min($maxWidth / $image['width'], $maxHeight / $image['height']);
        $width = $image['width'] * $scale; $height = $image['height'] * $scale;
        $this->ensure($height + 16);
        if ($center) $x = (595 - $width) / 2;
        $y = $this->y() - $height;
        $this->pages[$this->page]['content'] .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $width, $height, $x, $y, $image['name']);
        $this->pages[$this->page]['images'][$image['name']] = true;
        $this->setY($y - 16);
    }
    public function fixedImage(array $image, float $x, float $topY, float $maxWidth, float $maxHeight): array {
        $scale = min($maxWidth / $image['width'], $maxHeight / $image['height']);
        $width = $image['width'] * $scale; $height = $image['height'] * $scale;
        $y = $topY - $height;
        $this->pages[$this->page]['content'] .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $width, $height, $x, $y, $image['name']);
        $this->pages[$this->page]['images'][$image['name']] = true;
        return ['width' => $width, 'height' => $height, 'bottom' => $y];
    }
    public function imageRow(array $images): void {
        if (!$images) return;
        $prepared = [];
        foreach (array_slice($images, 0, 2) as $image) {
            $scale = min(204.6 / $image['width'], 303.6 / $image['height']);
            $prepared[] = ['image' => $image, 'width' => $image['width'] * $scale, 'height' => $image['height'] * $scale];
        }
        $rowHeight = max(array_column($prepared, 'height'));
        $this->ensure($rowHeight + 20);
        $total = array_sum(array_column($prepared, 'width')) + (count($prepared) - 1) * 18;
        $x = (595 - $total) / 2; $y = $this->y() - $rowHeight;
        foreach ($prepared as $item) {
            $imageY = $y + ($rowHeight - $item['height']);
            $this->pages[$this->page]['content'] .= sprintf("q %.2F 0 0 %.2F %.2F %.2F cm /%s Do Q\n", $item['width'], $item['height'], $x, $imageY, $item['image']['name']);
            $this->pages[$this->page]['images'][$item['image']['name']] = true;
            $x += $item['width'] + 18;
        }
        $this->setY($y - 18);
    }
}

function registerJpegImage(string $dataUrl, array &$images): ?array {
    if (!preg_match('#^data:image/(?:jpeg|jpg|png|webp);base64,(.+)$#', $dataUrl, $matches)) return null;
    $binary = base64_decode($matches[1], true);
    if ($binary === false || strlen($binary) > 6 * 1024 * 1024) return null;
    $size = @getimagesizefromstring($binary);
    if (!$size) return null;
    if (($size['mime'] ?? '') !== 'image/jpeg') {
        if (!function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) return null;
        $source = @imagecreatefromstring($binary);
        if (!$source) return null;
        $width = imagesx($source);
        $height = imagesy($source);
        $canvas = imagecreatetruecolor($width, $height);
        if (!$canvas) {
            imagedestroy($source);
            return null;
        }
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefilledrectangle($canvas, 0, 0, $width, $height, $white);
        imagecopy($canvas, $source, 0, 0, 0, 0, $width, $height);
        ob_start();
        imagejpeg($canvas, null, 82);
        $converted = ob_get_clean();
        imagedestroy($source);
        imagedestroy($canvas);
        if (!is_string($converted) || $converted === '') return null;
        $binary = $converted;
        $size = @getimagesizefromstring($binary);
        if (!$size || ($size['mime'] ?? '') !== 'image/jpeg') return null;
    }
    $name = 'Im' . (count($images) + 1);
    $images[$name] = ['name' => $name, 'binary' => $binary, 'width' => (int) $size[0], 'height' => (int) $size[1]];
    return $images[$name];
}

function addObject(array &$objects, string $value): int { $objects[] = $value; return count($objects); }

rejectIncompletePdfPost();

$name = trim((string) ($_POST['name'] ?? 'Aluno'));
$birthDate = trim((string) ($_POST['birthDate'] ?? ''));
$className = trim((string) ($_POST['className'] ?? 'Turma não informada'));
$period = trim((string) ($_POST['period'] ?? 'Período avaliativo'));
$documentType = ($_POST['documentType'] ?? '') === 'portfolio' ? 'PORTFÓLIO' : 'PARECER PEDAGÓGICO';
$text = trim((string) ($_POST['text'] ?? ''));
$entries = json_decode((string) ($_POST['entries'] ?? '[]'), true) ?: [];
$headerNetwork = trim((string) ($_POST['headerNetwork'] ?? ''));
$headerSchool = trim((string) ($_POST['headerSchool'] ?? ''));
$headerContact = trim((string) ($_POST['headerContact'] ?? ''));
$finalText = trim((string) ($_POST['finalText'] ?? ''));
$documentFont = (string) ($_POST['documentFont'] ?? 'Arial');
$documentFontSize = min(16, max(10, (float) ($_POST['documentFontSize'] ?? 12)));
$detailColor = sanitizeHexColorPdf((string) ($_POST['detailColor'] ?? '253C31'));
$pdfFonts = sanitizePdfFont($documentFont);
$images = [];
$headerLogo = registerJpegImage((string) ($_POST['headerLogo'] ?? ''), $images);
$studentPhoto = registerJpegImage((string) ($_POST['studentPhoto'] ?? ''), $images);

if ($name === 'Aluno' && $text === '' && empty($entries)) {
    http_response_code(422);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Dados insuficientes para gerar o PDF.');
}

$entryBlocks = [];
foreach ($entries as $entry) {
    $entryImages = [];
    foreach (($entry['photos'] ?? []) as $photo) {
        $image = registerJpegImage((string) $photo, $images);
        if ($image) $entryImages[] = $image;
    }
    $entryBlocks[] = ['note' => trim((string) ($entry['photoNote'] ?? '')), 'images' => $entryImages];
}

$layout = new PdfLayout($documentFontSize);
if ($headerNetwork !== '' || $headerSchool !== '' || $headerContact !== '' || $headerLogo) {
    foreach (array_filter(array_merge([$headerNetwork, $headerSchool], preg_split('/\R/u', $headerContact) ?: [])) as $line) $layout->line($line, 36, 7, 'F2', 10, $detailColor);
    if ($headerLogo) {
        $savedY = $layout->y(); $layout->setY(796); $layout->image($headerLogo, 425, 120, 65); $layout->setY(min($savedY - 24, 690));
    } else $layout->setY($layout->y() - 24);
}

$birthObject = DateTime::createFromFormat('Y-m-d', $birthDate);
$birth = $birthObject ? $birthObject->format('d/m/Y') : ($birthDate ?: 'Não informado');
$studentBlockTop = $layout->y();
$photoBottom = $studentBlockTop - 92;
if ($studentPhoto) {
    $photo = $layout->fixedImage($studentPhoto, 455, $studentBlockTop + 2, 88, 118);
    $photoBottom = $photo['bottom'];
}
$layout->line('NOME: ' . $name, 36, 10, 'F2', 20, $detailColor);
$layout->line('D.N.: ' . $birth, 36, 10, 'F2', 20, $detailColor);
$layout->line('TURMA: ' . $className, 36, 10, 'F2', 20, $detailColor);
$layout->line('ANO: ' . date('Y'), 36, 10, 'F2', 20, $detailColor);
$layout->setY(min($layout->y(), $photoBottom) - 34);
$layout->centered($documentType . ' - ' . mb_strtoupper($period, 'UTF-8'), $documentFontSize, 'F2', 30, $detailColor);
$layout->paragraph($text);
foreach ($entryBlocks as $entry) {
    if ($entry['note'] !== '') {
        foreach (preg_split('/\R+/u', $entry['note']) ?: [] as $noteBlock) {
            $noteBlock = trim($noteBlock);
            if ($noteBlock !== '') $layout->paragraph($noteBlock);
        }
    }
    foreach (array_chunk($entry['images'], 2) as $row) $layout->imageRow($row);
}
if ($finalText !== '') $layout->paragraph($finalText);
$layout->setY($layout->y() - 8);
$months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
$dateText = 'Curitiba, ' . date('d') . ' de ' . $months[(int) date('n') - 1] . ' de ' . date('Y') . '.';
$layout->line($dateText, 315, 11, 'F1', 18);

$objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
$fontRegular = addObject($objects, '<< /Type /Font /Subtype /Type1 /BaseFont /' . $pdfFonts[0] . ' /Encoding /WinAnsiEncoding >>');
$fontBold = addObject($objects, '<< /Type /Font /Subtype /Type1 /BaseFont /' . $pdfFonts[1] . ' /Encoding /WinAnsiEncoding >>');
$imageRefs = [];
foreach ($images as $image) $imageRefs[$image['name']] = addObject($objects, '<< /Type /XObject /Subtype /Image /Width ' . $image['width'] . ' /Height ' . $image['height'] . ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' . strlen($image['binary']) . " >>\nstream\n" . $image['binary'] . "\nendstream");
$pageRefs = [];
foreach ($layout->pages as $page) {
    $contentRef = addObject($objects, '<< /Length ' . strlen($page['content']) . " >>\nstream\n" . $page['content'] . "endstream");
    $xObjects = '';
    foreach (array_keys($page['images']) as $name) $xObjects .= '/' . $name . ' ' . $imageRefs[$name] . ' 0 R ';
    $resources = '<< /Font << /F1 ' . $fontRegular . ' 0 R /F2 ' . $fontBold . ' 0 R >>' . ($xObjects ? ' /XObject << ' . $xObjects . '>>' : '') . ' >>';
    $pageRefs[] = addObject($objects, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ' . $resources . ' /Contents ' . $contentRef . ' 0 R >>');
}
$objects[1] = '<< /Type /Pages /Kids [' . implode(' ', array_map(static fn(int $ref): string => $ref . ' 0 R', $pageRefs)) . '] /Count ' . count($pageRefs) . ' >>';
$pdf = "%PDF-1.4\n"; $offsets = [0];
foreach ($objects as $index => $object) { $offsets[] = strlen($pdf); $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n"; }
$xref = strlen($pdf); $pdf .= 'xref' . "\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
for ($index = 1; $index <= count($objects); $index++) $pdf .= sprintf('%010d 00000 n ', $offsets[$index]) . "\n";
$pdf .= 'trailer' . "\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF";

$filename = 'parecer-' . preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT', $name) ?: $name) . '.pdf';
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . strlen($pdf));
echo $pdf;
