<?php
declare(strict_types=1);

function xmlText(DOMDocument $document, string $value): DOMElement
{
    $text = $document->createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    $text->setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    $text->appendChild($document->createTextNode($value));
    return $text;
}

function sanitizeDocumentFont(string $font): string
{
    $allowed = ['Arial', 'Times New Roman', 'Calibri', 'Georgia', 'Verdana', 'Courier New'];
    return in_array($font, $allowed, true) ? $font : 'Arial';
}

function sanitizeHexColor(string $color, string $fallback = '253C31'): string
{
    $color = strtoupper(ltrim(trim($color), '#'));
    return preg_match('/^[0-9A-F]{6}$/', $color) ? $color : $fallback;
}

function ensureRunFonts(DOMDocument $document, DOMElement $properties, string $fontName): void
{
    $wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('w', $wordNs);
    $fonts = $xpath->query('./w:rFonts', $properties)->item(0);
    if (!$fonts) {
        $fonts = $document->createElementNS($wordNs, 'w:rFonts');
        $properties->insertBefore($fonts, $properties->firstChild);
    }
    foreach (['ascii', 'hAnsi', 'eastAsia', 'cs'] as $type) {
        $fonts->setAttributeNS($wordNs, 'w:' . $type, $fontName);
    }
    $fonts->setAttributeNS($wordNs, 'w:hint', 'default');
    foreach (['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'csTheme'] as $themeAttribute) {
        $fonts->removeAttributeNS($wordNs, $themeAttribute);
    }
}

function removeNodesByXPath(DOMDocument $document, DOMXPath $xpath, array $queries): void
{
    foreach ($queries as $query) {
        foreach (iterator_to_array($xpath->query($query)) as $node) {
            $node->parentNode?->removeChild($node);
        }
    }
}

function unwrapContentControls(DOMDocument $document, DOMXPath $xpath): void
{
    do {
        $controls = iterator_to_array($xpath->query('//w:sdt'));
        foreach ($controls as $control) {
            $content = $xpath->query('./w:sdtContent', $control)->item(0);
            $parent = $control->parentNode;
            if (!$content || !$parent) {
                $parent?->removeChild($control);
                continue;
            }
            foreach (iterator_to_array($content->childNodes) as $child) {
                $parent->insertBefore($child->cloneNode(true), $control);
            }
            $parent->removeChild($control);
        }
    } while (!empty($controls));
}

function paragraph(DOMDocument $document, string $value, array $options = []): DOMElement
{
    $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $p = $document->createElementNS($w, 'w:p');
    $pPr = $document->createElementNS($w, 'w:pPr');
    $spacing = $document->createElementNS($w, 'w:spacing');
    $spacing->setAttributeNS($w, 'w:after', (string) ($options['after'] ?? 120));
    $spacing->setAttributeNS($w, 'w:line', (string) ($options['line'] ?? 360));
    $spacing->setAttributeNS($w, 'w:lineRule', 'auto');
    $pPr->appendChild($spacing);
    if (($options['align'] ?? '') !== '') {
        $align = $document->createElementNS($w, 'w:jc');
        $align->setAttributeNS($w, 'w:val', $options['align']);
        $pPr->appendChild($align);
    }
    if (!empty($options['indent'])) {
        $indent = $document->createElementNS($w, 'w:ind');
        $indent->setAttributeNS($w, 'w:firstLine', '709');
        $pPr->appendChild($indent);
    }
    $p->appendChild($pPr);
    $run = $document->createElementNS($w, 'w:r');
    $rPr = $document->createElementNS($w, 'w:rPr');
    $fontFamily = $options['font'] ?? ($GLOBALS['documentFont'] ?? 'Arial');
    ensureRunFonts($document, $rPr, $fontFamily);
    $size = $document->createElementNS($w, 'w:sz');
    $size->setAttributeNS($w, 'w:val', (string) ($options['size'] ?? 24));
    $rPr->appendChild($size);
    $complexSize = $document->createElementNS($w, 'w:szCs');
    $complexSize->setAttributeNS($w, 'w:val', (string) ($options['size'] ?? 24));
    $rPr->appendChild($complexSize);
    if (!empty($options['color'])) {
        $color = $document->createElementNS($w, 'w:color');
        $color->setAttributeNS($w, 'w:val', $options['color']);
        $rPr->appendChild($color);
    }
    if (!empty($options['bold'])) {
        $rPr->appendChild($document->createElementNS($w, 'w:b'));
    }
    $run->appendChild($rPr);
    $run->appendChild(xmlText($document, $value));
    $p->appendChild($run);
    return $p;
}

function appendTextParagraphs(DOMElement $body, DOMDocument $document, string $text, array $options = []): void
{
    foreach (preg_split('/\R+/u', trim($text)) ?: [] as $block) {
        $block = trim(preg_replace('/[ \t]+/u', ' ', $block));
        if ($block !== '') {
            $body->appendChild(paragraph($document, $block, $options));
        }
    }
}

function imageParagraph(DOMDocument $document, string $relationshipId, int $imageId, string $name, int $cx, int $cy): DOMNode
{
    $fragment = $document->createDocumentFragment();
    $xml = '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="114300" distR="114300"><wp:extent cx="'.$cx.'" cy="'.$cy.'"/><wp:docPr id="'.$imageId.'" name="'.htmlspecialchars($name, ENT_XML1).'"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="'.htmlspecialchars($name, ENT_XML1).'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'.$relationshipId.'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'.$cx.'" cy="'.$cy.'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    $fragment->appendXML($xml);
    return $fragment;
}

function imageRowParagraph(DOMDocument $document, array $images): DOMElement
{
    $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $paragraph = $document->createElementNS($w, 'w:p');
    $properties = $document->createElementNS($w, 'w:pPr');
    $alignment = $document->createElementNS($w, 'w:jc'); $alignment->setAttributeNS($w, 'w:val', 'center');
    $properties->appendChild($alignment); $paragraph->appendChild($properties);
    foreach ($images as $image) {
        $fragment = imageParagraph($document, $image['rid'], $image['id'], 'Foto da vivência', $image['cx'], $image['cy']);
        $sourceParagraph = $fragment->firstChild;
        $run = $sourceParagraph?->getElementsByTagNameNS($w, 'r')->item(0);
        if ($run) $paragraph->appendChild($document->importNode($run, true));
    }
    return $paragraph;
}

function identificationTable(DOMDocument $document, array $lines, ?DOMNode $photo, int $fontSize = 20, ?string $color = null): DOMElement
{
    $w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $el=fn(string $name)=>$document->createElementNS($w,$name);
    $attr=function(DOMElement $node,string $name,string $value) use($w){$node->setAttributeNS($w,'w:'.$name,$value);};
    $table=$el('w:tbl'); $pr=$el('w:tblPr'); $width=$el('w:tblW');$attr($width,'w','9360');$attr($width,'type','dxa');$pr->appendChild($width);
    $borders=$el('w:tblBorders');foreach(['top','left','bottom','right','insideH','insideV'] as $side){$border=$el('w:'.$side);$attr($border,'val','nil');$borders->appendChild($border);}$pr->appendChild($borders);$table->appendChild($pr);
    $grid=$el('w:tblGrid');foreach([7300,2060] as $value){$col=$el('w:gridCol');$attr($col,'w',(string)$value);$grid->appendChild($col);}$table->appendChild($grid);
    $row=$el('w:tr');
    foreach([[7300,$lines],[2060,$photo]] as [$cellWidth,$content]){$cell=$el('w:tc');$cellPr=$el('w:tcPr');$cellW=$el('w:tcW');$attr($cellW,'w',(string)$cellWidth);$attr($cellW,'type','dxa');$cellPr->appendChild($cellW);$cell->appendChild($cellPr);if(is_array($content)){foreach($content as $line){$fragment=paragraph($document,$line,['bold'=>true,'size'=>$fontSize,'color'=>$color,'after'=>20]);$cell->appendChild($fragment);}}elseif($content){$cell->appendChild($content);}else{$cell->appendChild($el('w:p'));}$row->appendChild($cell);}
    $table->appendChild($row);return $table;
}

function addImageToDocx(ZipArchive $zip, string $dataUrl, int $imageId): ?array
{
    static $rels = null;
    if (!preg_match('#^data:(image/(?:jpeg|jpg|png));base64,(.+)$#', $dataUrl, $matches)) return null;
    $binary = base64_decode($matches[2], true); if ($binary === false) return null;
    $size = @getimagesizefromstring($binary); if (!$size) return null;
    [$width, $height] = $size; $scale = min(2179320 / $width, 3432000 / $height); $cx = (int)($width * $scale); $cy = (int)($height * $scale);
    $ext = str_contains($matches[1], 'png') ? 'png' : 'jpg';
    $zip->addFromString('word/media/parecer-'.$imageId.'.'.$ext, $binary);
    if ($rels === null) {
        $rels = new DOMDocument();
        $relsXml = $zip->getFromName('word/_rels/document.xml.rels');
        if ($relsXml === false) {
            $rels->loadXML('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
        } else {
            $rels->loadXML($relsXml);
        }
    }
    $rel = $rels->createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship');
    $rid = 'rIdParecer'.$imageId; $rel->setAttribute('Id', $rid); $rel->setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'); $rel->setAttribute('Target', 'media/parecer-'.$imageId.'.'.$ext);
    $rels->documentElement->appendChild($rel); $zip->addFromString('word/_rels/document.xml.rels', $rels->saveXML());
    return ['rid' => $rid, 'cx' => $cx, 'cy' => $cy];
}

/** Fixa a fonte escolhida em estilos, tema e tabela de fontes do pacote DOCX. */
function forceFontInDocxPackage(ZipArchive $zip, string $fontName): void
{
    $wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    foreach (['word/styles.xml', 'word/stylesWithEffects.xml'] as $stylesPartName) {
        $stylesXml = $zip->getFromName($stylesPartName);
        if ($stylesXml === false) continue;
        $styles = new DOMDocument('1.0', 'UTF-8');
        $styles->preserveWhiteSpace = false;
        if ($styles->loadXML($stylesXml)) {
            $xpath = new DOMXPath($styles);
            $xpath->registerNamespace('w', $wordNs);
            $docDefaults = $xpath->query('/w:styles/w:docDefaults')->item(0);
            if (!$docDefaults) {
                $docDefaults = $styles->createElementNS($wordNs, 'w:docDefaults');
                $styles->documentElement->insertBefore($docDefaults, $styles->documentElement->firstChild);
            }
            $rPrDefault = $xpath->query('./w:rPrDefault', $docDefaults)->item(0);
            if (!$rPrDefault) {
                $rPrDefault = $styles->createElementNS($wordNs, 'w:rPrDefault');
                $docDefaults->appendChild($rPrDefault);
            }
            $defaultRunProperties = $xpath->query('./w:rPr', $rPrDefault)->item(0);
            if (!$defaultRunProperties) {
                $defaultRunProperties = $styles->createElementNS($wordNs, 'w:rPr');
                $rPrDefault->appendChild($defaultRunProperties);
            }
            ensureRunFonts($styles, $defaultRunProperties, $fontName);
            foreach ($xpath->query('//w:style') as $style) {
                $properties = $xpath->query('./w:rPr', $style)->item(0);
                if (!$properties) {
                    $properties = $styles->createElementNS($wordNs, 'w:rPr');
                    $style->appendChild($properties);
                }
                ensureRunFonts($styles, $properties, $fontName);
            }
            foreach ($xpath->query('//w:rPr') as $properties) {
                ensureRunFonts($styles, $properties, $fontName);
            }
            removeNodesByXPath($styles, $xpath, [
                '//w:locked',
                '//w:semiHidden',
                '//w:styleLockQFSet',
                '//w:styleLockTheme',
            ]);
            $zip->addFromString($stylesPartName, $styles->saveXML());
        }
    }

    // Evita que fontes major/minor do tema substituam a fonte dos estilos.
    $themeXml = $zip->getFromName('word/theme/theme1.xml');
    if ($themeXml !== false) {
        $theme = new DOMDocument('1.0', 'UTF-8');
        $theme->preserveWhiteSpace = false;
        if ($theme->loadXML($themeXml)) {
            $xpath = new DOMXPath($theme);
            $xpath->registerNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main');
            foreach ($xpath->query('//a:majorFont/a:latin | //a:minorFont/a:latin') as $latinFont) {
                $latinFont->setAttribute('typeface', $fontName);
            }
            $zip->addFromString('word/theme/theme1.xml', $theme->saveXML());
        }
    }

    // Alguns editores usam a tabela de fontes como fallback do modelo.
    $fontTableXml = $zip->getFromName('word/fontTable.xml');
    if ($fontTableXml !== false) {
        $fontTable = new DOMDocument('1.0', 'UTF-8');
        $fontTable->preserveWhiteSpace = false;
        if ($fontTable->loadXML($fontTableXml)) {
            $xpath = new DOMXPath($fontTable);
            $xpath->registerNamespace('w', $wordNs);
            if ($xpath->query('//w:font[@w:name="' . $fontName . '"]')->length === 0) {
                $font = $fontTable->createElementNS($wordNs, 'w:font');
                $font->setAttributeNS($wordNs, 'w:name', $fontName);
                $fontTable->documentElement?->appendChild($font);
            }
            $zip->addFromString('word/fontTable.xml', $fontTable->saveXML());
        }
    }

    $partNames = [];
    for ($index = 0; $index < $zip->numFiles; $index++) {
        $name = $zip->statIndex($index)['name'] ?? '';
        if (preg_match('#^word/(header|footer|footnotes|endnotes|comments)\d*\.xml$#', $name) || $name === 'word/numbering.xml') {
            $partNames[] = $name;
        }
    }
    foreach ($partNames as $partName) {
        $partXml = $zip->getFromName($partName);
        if ($partXml === false) continue;
        $part = new DOMDocument('1.0', 'UTF-8');
        $part->preserveWhiteSpace = false;
        if (!$part->loadXML($partXml)) continue;
        removeWordProtectionFromDocumentPart($part);
        forceFontInDocumentPart($part, $fontName);
        $zip->addFromString($partName, $part->saveXML());
    }
}

function removeWordProtectionFromPackage(ZipArchive $zip): void
{
    $wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    foreach (['word/settings.xml'] as $partName) {
        $xml = $zip->getFromName($partName);
        if ($xml === false) continue;
        $document = new DOMDocument('1.0', 'UTF-8');
        $document->preserveWhiteSpace = false;
        if (!$document->loadXML($xml)) continue;
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('w', $wordNs);
        removeNodesByXPath($document, $xpath, [
            '//w:documentProtection',
            '//w:writeProtection',
            '//w:permStart',
            '//w:permEnd',
            '//w:lock',
            '//w:styleLockQFSet',
            '//w:styleLockTheme',
            '//w:formsDesign',
            '//w:formProt',
            '//w:readOnlyRecommended',
            '//w:trackRevisions',
            '//w:revisionView',
        ]);
        $zip->addFromString($partName, $document->saveXML());
    }
}

function forceFontInDocumentPart(DOMDocument $document, string $fontName): void
{
    $wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('w', $wordNs);
    foreach ($xpath->query('//w:r') as $run) {
        $properties = $xpath->query('./w:rPr', $run)->item(0);
        if (!$properties) {
            $properties = $document->createElementNS($wordNs, 'w:rPr');
            $run->insertBefore($properties, $run->firstChild);
        }
        ensureRunFonts($document, $properties, $fontName);
    }
}

function removeWordProtectionFromDocumentPart(DOMDocument $document): void
{
    $wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    $xpath = new DOMXPath($document);
    $xpath->registerNamespace('w', $wordNs);
    unwrapContentControls($document, $xpath);
    removeNodesByXPath($document, $xpath, [
        '//w:documentProtection',
        '//w:writeProtection',
        '//w:permStart',
        '//w:permEnd',
        '//w:lock',
        '//w:locked',
        '//w:styleLockQFSet',
        '//w:styleLockTheme',
        '//w:formsDesign',
        '//w:formProt',
        '//w:readOnlyRecommended',
        '//w:trackRevisions',
        '//w:revisionView',
    ]);
}

$template = __DIR__ . '/templates/parecer-base-limpa.docx';
if (!extension_loaded('zip') || !is_file($template)) {
    http_response_code(500);
    exit('Modelo de parecer indisponível.');
}

$name = trim((string) ($_POST['name'] ?? ''));
$birthDate = trim((string) ($_POST['birthDate'] ?? ''));
$class = trim((string) ($_POST['className'] ?? ''));
$period = trim((string) ($_POST['period'] ?? ''));
$documentType = ($_POST['documentType'] ?? '') === 'portfolio' ? 'PORTFÓLIO' : 'PARECER PEDAGÓGICO';
$text = trim((string) ($_POST['text'] ?? ''));
$studentPhoto = (string) ($_POST['studentPhoto'] ?? '');
$entries = json_decode((string) ($_POST['entries'] ?? '[]'), true) ?: [];
$headerNetwork = trim((string) ($_POST['headerNetwork'] ?? ''));
$headerSchool = trim((string) ($_POST['headerSchool'] ?? ''));
$headerContact = trim((string) ($_POST['headerContact'] ?? ''));
$headerLogo = (string) ($_POST['headerLogo'] ?? '');
$finalText = trim((string) ($_POST['finalText'] ?? ''));
$documentFont = sanitizeDocumentFont((string) ($_POST['documentFont'] ?? 'Arial'));
$documentFontSizePt = min(16, max(10, (int) ($_POST['documentFontSize'] ?? 12)));
$documentFontSize = $documentFontSizePt * 2;
$detailColor = sanitizeHexColor((string) ($_POST['detailColor'] ?? '253C31'));
$GLOBALS['documentFont'] = $documentFont;
if ($name === '' || $class === '' || $text === '') {
    http_response_code(422);
    exit('Dados insuficientes para gerar o parecer.');
}

$date = DateTime::createFromFormat('Y-m-d', $birthDate);
$birth = $date ? $date->format('d/m/Y') : 'Não informado';
$year = (new DateTime())->format('Y');
$outPath = tempnam(sys_get_temp_dir(), 'parecer_') . '.docx';
copy($template, $outPath);
$zip = new ZipArchive();
if ($zip->open($outPath) !== true) {
    http_response_code(500);
    exit('Não foi possível preparar o documento.');
}

// Força Arial como padrão do documento, inclusive em estilos herdados do modelo.
removeWordProtectionFromPackage($zip);
forceFontInDocxPackage($zip, $documentFont);

$xml = $zip->getFromName('word/document.xml');
$document = new DOMDocument('1.0', 'UTF-8');
$document->preserveWhiteSpace = false;
$document->loadXML($xml);
$xpath = new DOMXPath($document);
$xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
$body = $xpath->query('/w:document/w:body')->item(0);
$section = $xpath->query('./w:sectPr', $body)->item(0);
$sectionCopy = $section ? $section->cloneNode(true) : null;
while ($body->firstChild) {
    $body->removeChild($body->firstChild);
}

$imageCounter = 100;
$headerLogoParagraph = null;
if ($headerLogo !== '' && ($image = addImageToDocx($zip, $headerLogo, $imageCounter))) {
    $scale = min(900000 / $image['cx'], 700000 / $image['cy']);
    $headerLogoParagraph = imageParagraph($document, $image['rid'], $imageCounter++, 'Logo institucional', (int)($image['cx']*$scale), (int)($image['cy']*$scale));
}
$headerLines = array_values(array_filter(array_merge([$headerNetwork, $headerSchool], preg_split('/\R/u', $headerContact))));
if ($headerLines || $headerLogoParagraph) {
    $body->appendChild(identificationTable($document, $headerLines, $headerLogoParagraph, 14, $detailColor));
    $body->appendChild(paragraph($document, '', ['after'=>180]));
}
$studentPhotoParagraph = null;
if ($studentPhoto !== '' && ($image = addImageToDocx($zip, $studentPhoto, $imageCounter))) {
    $scale = min(1100000 / $image['cx'], 1450000 / $image['cy']);
    $studentPhotoParagraph = imageParagraph($document, $image['rid'], $imageCounter++, 'Foto do aluno', (int)($image['cx']*$scale), (int)($image['cy']*$scale));
    $alignment = $studentPhotoParagraph->firstChild?->getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'jc')->item(0);
    if ($alignment) $alignment->setAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:val', 'right');
}
$body->appendChild(identificationTable($document,['NOME: '.$name,'D.N.: '.$birth,'TURMA: '.$class,'ANO: '.$year],$studentPhotoParagraph, 20, $detailColor));
$body->appendChild(paragraph($document, $documentType . ' - ' . mb_strtoupper($period, 'UTF-8'), ['bold' => true, 'size' => $documentFontSize, 'align' => 'center', 'after' => 260, 'color' => $detailColor]));
foreach (preg_split('/\R{2,}/u', $text) as $block) {
    $block = trim(preg_replace('/\s+/u', ' ', $block));
    if ($block !== '') {
        $body->appendChild(paragraph($document, $block, ['align' => 'both', 'indent' => true, 'after' => 150, 'size' => $documentFontSize]));
    }
}
foreach ($entries as $entry) {
    $note = trim((string) ($entry['photoNote'] ?? ''));
    if ($note !== '') appendTextParagraphs($body, $document, $note, ['align' => 'both', 'indent' => true, 'after' => 120, 'size' => $documentFontSize]);
    $row = [];
    foreach (($entry['photos'] ?? []) as $photo) if (($image = addImageToDocx($zip, (string) $photo, $imageCounter))) {
        $scale = min(1651000 / $image['cx'], 2600000 / $image['cy']);
        $row[] = ['rid'=>$image['rid'],'id'=>$imageCounter++,'cx'=>(int)($image['cx']*$scale),'cy'=>(int)($image['cy']*$scale)];
        if (count($row) === 2) { $body->appendChild(imageRowParagraph($document, $row)); $row=[]; }
    }
    if ($row) $body->appendChild(imageRowParagraph($document, $row));
}
foreach (preg_split('/\R{2,}/u', $finalText) as $block) {
    $block = trim(preg_replace('/\s+/u', ' ', $block));
    if ($block !== '') {
        $body->appendChild(paragraph($document, $block, ['align' => 'both', 'indent' => true, 'after' => 150, 'size' => $documentFontSize]));
    }
}
$months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
$today = new DateTime();
$body->appendChild(paragraph($document, 'Curitiba, ' . $today->format('d') . ' de ' . $months[(int) $today->format('n') - 1] . ' de ' . $today->format('Y') . '.', ['align' => 'right', 'after' => 0]));
if ($sectionCopy) {
    $margins = $xpath->query('./w:pgMar', $sectionCopy)->item(0);
    if ($margins) {
        $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        $margins->setAttributeNS($w, 'w:top', '1701');
        $margins->setAttributeNS($w, 'w:left', '1701');
        $margins->setAttributeNS($w, 'w:right', '1134');
        $margins->setAttributeNS($w, 'w:bottom', '1134');
    }
    $body->appendChild($sectionCopy);
}
removeWordProtectionFromDocumentPart($document);
forceFontInDocumentPart($document, $documentFont);
$zip->addFromString('word/document.xml', $document->saveXML());
$zip->close();

$filename = 'parecer-' . preg_replace('/[^\pL\pN]+/u', '-', mb_strtolower($name, 'UTF-8')) . '.docx';
header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($outPath));
readfile($outPath);
unlink($outPath);
