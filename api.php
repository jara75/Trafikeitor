<?php
/**
 * EL MARCANTE // CONTROL DE TRÁFICO & STRIPBOARD
 * Micro-Backend REST para Hostinger (trafico.elmarcante.com) y Entorno Local
 * Soporta MySQL/MariaDB en Hostinger + Fallback automático a SQLite local (trafico.db)
 * Incluye extractor nativo de vistas previas para Affinity (.af*), Apple iWork (.pages/.key/.numbers) y Adobe (.ai/.psd)
 */

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Share-Token');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================================
// 1. CONFIGURACIÓN DE BASE DE DATOS (HOSTINGER MYSQL O SQLITE LOCAL AUTOMÁTICO)
// ============================================================================
$config = [
    'driver'    => getenv('TRAFICO_DB_DRIVER') ?: 'sqlite', // Cambiar a 'mysql' en Hostinger o vía variables de entorno
    'host'      => getenv('TRAFICO_DB_HOST') ?: '127.0.0.1',
    'dbname'    => getenv('TRAFICO_DB_NAME') ?: 'u123456789_trafico',
    'user'      => getenv('TRAFICO_DB_USER') ?: 'u123456789_admin',
    'pass'      => getenv('TRAFICO_DB_PASS') ?: '',
    'sqlite'    => __DIR__ . '/trafico.db',
    'uploads'   => __DIR__ . '/uploads',
    'studio_id' => 1
];

if (!is_dir($config['uploads'])) {
    @mkdir($config['uploads'], 0775, true);
}

function getDb(array $cfg): PDO {
    if ($cfg['driver'] === 'mysql' && !empty($cfg['pass'])) {
        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['dbname']};charset=utf8mb4";
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
        return $pdo;
    }

    // Modo SQLite autocontenido (cero configuración)
    $pdo = new PDO('sqlite:' . $cfg['sqlite'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('CREATE TABLE IF NOT EXISTS kv_store (
        studio_id INTEGER NOT NULL DEFAULT 1,
        k TEXT NOT NULL,
        v TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (studio_id, k)
    );');
    return $pdo;
}

// ============================================================================
// 2. EXTRACTOR DE VISTAS PREVIAS EN SERVIDOR (AFFINITY, IWORK, ADOBE)
// ============================================================================
function extractServerPreview(string $filePath, string $ext, string $destDir, string $baseName): ?array {
    $ext = strtolower($ext);

    // A) Apple iWork (.pages, .numbers, .key) y Office (.docx, .pptx) -> ZIP interno con QuickLook
    if (in_array($ext, ['pages', 'numbers', 'key', 'docx', 'pptx'], true) && class_exists('ZipArchive')) {
        $zip = new ZipArchive();
        if ($zip->open($filePath) === true) {
            $candidates = [
                'QuickLook/Preview.pdf'   => ['ext' => 'pdf', 'kind' => 'pdf'],
                'QuickLook/Thumbnail.jpg' => ['ext' => 'jpg', 'kind' => 'image'],
                'preview.jpg'             => ['ext' => 'jpg', 'kind' => 'image'],
                'preview-web.jpg'         => ['ext' => 'jpg', 'kind' => 'image'],
                'docProps/thumbnail.jpeg' => ['ext' => 'jpg', 'kind' => 'image'],
            ];
            foreach ($candidates as $entryName => $info) {
                $idx = $zip->locateName($entryName, ZipArchive::FL_NOCASE);
                if ($idx !== false) {
                    $data = $zip->getFromIndex($idx);
                    if ($data !== false && strlen($data) > 64) {
                        $previewFile = $baseName . '.preview.' . $info['ext'];
                        file_put_contents($destDir . '/' . $previewFile, $data);
                        $zip->close();
                        return ['file' => $previewFile, 'kind' => $info['kind']];
                    }
                }
            }
            $zip->close();
        }
    }

    // B) Affinity (.afdesign, .afphoto, .afpub) -> PNG embebido en el flujo binario
    if (in_array($ext, ['afdesign', 'afphoto', 'afpub'], true)) {
        $raw = @file_get_contents($filePath, false, null, 0, 12 * 1024 * 1024);
        if ($raw !== false) {
            $pngStartSig = "\x89PNG\r\n\x1a\n";
            $pngEndSig   = "IEND\xaeB`\x82";
            $offset = 0;
            $bestPng = '';
            while (($pos = strpos($raw, $pngStartSig, $offset)) !== false) {
                $endPos = strpos($raw, $pngEndSig, $pos);
                if ($endPos !== false) {
                    $slice = substr($raw, $pos, ($endPos + 8) - $pos);
                    if (strlen($slice) > strlen($bestPng)) {
                        $bestPng = $slice;
                    }
                    $offset = $endPos + 8;
                } else {
                    break;
                }
            }
            if (strlen($bestPng) > 128) {
                $previewFile = $baseName . '.preview.png';
                file_put_contents($destDir . '/' . $previewFile, $bestPng);
                return ['file' => $previewFile, 'kind' => 'image'];
            }
        }
    }

    // C) Adobe Illustrator (.ai) -> Flujo compatible con PDF
    if ($ext === 'ai') {
        $head = @file_get_contents($filePath, false, null, 0, 1024);
        if ($head !== false && strpos($head, '%PDF-') !== false) {
            return ['file' => basename($filePath), 'kind' => 'pdf'];
        }
    }

    return null;
}

// ============================================================================
// 3. ENRUTADOR DE ACCIONES REST
// ============================================================================
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = getDb($config);
    $action = $_GET['action'] ?? 'status';
    $studioId = (int)($config['studio_id']);

    if ($action === 'status') {
        echo json_encode([
            'ok' => true,
            'service' => 'EL MARCANTE // API DE TRÁFICO',
            'driver' => $config['driver'],
            'zip_support' => class_exists('ZipArchive')
        ]);
        exit;
    }

    // Sincronización completa de estado (Órdenes, Hoja de Ruta con Líneas, Media Pool y Stripboard)
    if ($action === 'load_state') {
        $stmt = $pdo->prepare('SELECT k, v FROM kv_store WHERE studio_id = :sid');
        $stmt->execute([':sid' => $studioId]);
        $rows = $stmt->fetchAll();
        $state = [];
        foreach ($rows as $r) {
            $state[$r['k']] = json_decode($r['v'], true);
        }
        echo json_encode(['ok' => true, 'state' => $state]);
        exit;
    }

    if ($action === 'save_state' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare('REPLACE INTO kv_store (studio_id, k, v, updated_at) VALUES (:sid, :k, :v, :u)');
        foreach (['orders', 'stripboard', 'statuses', 'clients'] as $key) {
            if (array_key_exists($key, $body)) {
                $stmt->execute([
                    ':sid' => $studioId,
                    ':k'   => $key,
                    ':v'   => json_encode($body[$key], JSON_UNESCAPED_UNICODE),
                    ':u'   => $now
                ]);
            }
        }
        echo json_encode(['ok' => true, 'saved_at' => $now]);
        exit;
    }

    // Subida física de archivo vinculada a un Sobre OT y a una Línea de la Hoja de Ruta
    if ($action === 'upload_media' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $otId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['ot_id'] ?? 'GENERAL');
        $routeLineIndex = isset($_POST['route_line_index']) && $_POST['route_line_index'] !== ''
            ? (int)$_POST['route_line_index']
            : null;

        if (empty($_FILES['file'])) {
            throw new RuntimeException('No se recibió ningún archivo.');
        }

        $file = $_FILES['file'];
        $origName = basename($file['name']);
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        $safeBase = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($origName, PATHINFO_FILENAME));
        $uniquePrefix = date('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 6);
        $destFileName = $uniquePrefix . '_' . $safeBase . ($ext ? '.' . $ext : '');

        $otDir = $config['uploads'] . '/' . $otId;
        if (!is_dir($otDir)) {
            @mkdir($otDir, 0775, true);
        }

        $destPath = $otDir . '/' . $destFileName;
        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            throw new RuntimeException('No se pudo guardar el archivo en el servidor.');
        }

        $relUrl = 'uploads/' . $otId . '/' . $destFileName;
        $previewInfo = extractServerPreview($destPath, $ext, $otDir, $destFileName);

        echo json_encode([
            'ok'               => true,
            'ot_id'            => $otId,
            'route_line_index' => $routeLineIndex,
            'name'             => $origName,
            'ext'              => $ext,
            'url'              => $relUrl,
            'preview_url'      => $previewInfo ? ('uploads/' . $otId . '/' . $previewInfo['file']) : null,
            'preview_kind'     => $previewInfo ? $previewInfo['kind'] : null
        ]);
        exit;
    }

    echo json_encode(['ok' => false, 'error' => 'Acción no reconocida']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
