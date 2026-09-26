<?php
/**
 * Déballe sur le serveur les archives d'un déploiement.
 *
 * Envoyer trente-cinq mille pages en FTP, c'est trente-cinq mille connexions
 * de données : trois heures et demie par publication. Une vingtaine d'archives
 * partent en quelques minutes ; il reste à les ouvrir là-bas, ce que ce script
 * fait, et rien d'autre.
 *
 * **Il n'existe que le temps d'un déploiement.** `envoyer-archives.ts` le
 * dépose sous un nom tiré au hasard, l'appelle, puis l'efface — y compris si
 * quelque chose échoue en route. Il ne connaît pas le jeton, seulement son
 * empreinte : le jeton reste dans les secrets du dépôt.
 *
 * Ce qu'il refuse, et pourquoi :
 *   — tout appel sans le bon jeton ;
 *   — une archive qui ne porte pas le préfixe de ce déploiement ;
 *   — un chemin qui remonte (`..`), qui commence par une barre, ou qui sort
 *     des caractères qu'emploient les noms du site ;
 *   — tout fichier exécutable par le serveur (`.php`, `.phtml`, `.phar`…) ;
 *   — tout fichier caché, sauf `.htaccess` et `.rouages` à la racine.
 *
 * Chaque fichier est écrit sous un nom temporaire puis renommé : une page en
 * ligne n'est jamais à moitié écrite.
 *
 * Écrit pour PHP 7.4 et au-delà : la version se choisit dans cPanel, et le
 * site n'a aucune raison d'en dépendre.
 */
declare(strict_types=1);

const EMPREINTE = '__EMPREINTE__';
const PREFIXE = '__PREFIXE__';
/** Entrées traitées par appel : le temps d'exécution de PHP et celui de Cloudflare sont bornés. */
const PAS = 1500;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function repondre(int $code, array $corps): void
{
    http_response_code($code);
    echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$jeton = $_SERVER['HTTP_X_DEPLOIEMENT'] ?? '';
if (!is_string($jeton) || $jeton === '' || !hash_equals(EMPREINTE, hash('sha256', $jeton))) {
    repondre(403, ['erreur' => 'jeton']);
}

$action = $_POST['action'] ?? '';
if ($action === 'ping') {
    repondre(200, ['ok' => true, 'php' => PHP_VERSION, 'zip' => class_exists('ZipArchive')]);
}
if ($action !== 'deballer') {
    repondre(400, ['erreur' => 'action']);
}
if (!class_exists('ZipArchive')) {
    repondre(500, ['erreur' => 'ZipArchive absent']);
}

$archive = (string) ($_POST['archive'] ?? '');
if (!preg_match('/^[0-9]{1,4}\.zip$/', $archive)) {
    repondre(400, ['erreur' => 'archive']);
}
$chemin = __DIR__ . '/' . PREFIXE . $archive;
$zip = new ZipArchive();
if ($zip->open($chemin, ZipArchive::RDONLY) !== true) {
    repondre(404, ['erreur' => 'archive illisible']);
}

/** Les chemins que le site emploie, et eux seuls. */
function admis(string $nom): bool
{
    if ($nom === '.htaccess' || $nom === '.rouages') {
        return true;
    }
    if (!preg_match('#^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$#', $nom)) {
        return false;
    }
    foreach (explode('/', $nom) as $segment) {
        if ($segment === '..' || $segment === '.') {
            return false;
        }
    }
    return !preg_match('/\.(php[0-9]?|phtml|phar|phps|cgi|pl|py|sh)$/i', $nom);
}

$total = $zip->numFiles;
$debut = max(0, (int) ($_POST['debut'] ?? 0));
$fin = min($total, $debut + PAS);
$ecrits = 0;
for ($i = $debut; $i < $fin; $i++) {
    $nom = $zip->getNameIndex($i);
    if ($nom === false || substr($nom, -1) === '/') {
        continue;
    }
    if (!admis($nom)) {
        $zip->close();
        repondre(422, ['erreur' => 'chemin refusé', 'chemin' => $nom]);
    }
    $cible = __DIR__ . '/' . $nom;
    $dossier = dirname($cible);
    if (!is_dir($dossier) && !mkdir($dossier, 0755, true) && !is_dir($dossier)) {
        $zip->close();
        repondre(500, ['erreur' => 'dossier', 'chemin' => $nom]);
    }
    $temporaire = $dossier . '/.in.' . basename($cible) . '.' . bin2hex(random_bytes(4));
    $lu = $zip->getStream($nom);
    $ecrit = $lu === false ? false : fopen($temporaire, 'wb');
    if ($lu === false || $ecrit === false || stream_copy_to_stream($lu, $ecrit) === false) {
        if (is_resource($ecrit)) {
            fclose($ecrit);
        }
        @unlink($temporaire);
        $zip->close();
        repondre(500, ['erreur' => 'écriture', 'chemin' => $nom]);
    }
    fclose($lu);
    fclose($ecrit);
    chmod($temporaire, 0644);
    if (!rename($temporaire, $cible)) {
        @unlink($temporaire);
        $zip->close();
        repondre(500, ['erreur' => 'renommage', 'chemin' => $nom]);
    }
    $ecrits++;
}
$zip->close();
repondre(200, ['fait' => $fin, 'total' => $total, 'ecrits' => $ecrits]);
