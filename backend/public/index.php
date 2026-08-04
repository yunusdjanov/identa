<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader. CI/audit environments may install an
// isolated dependency tree so they never reuse a stale local vendor folder.
$configuredVendorDir = getenv('COMPOSER_VENDOR_DIR');
$vendorDir = is_string($configuredVendorDir) && trim($configuredVendorDir) !== ''
    ? trim($configuredVendorDir)
    : 'vendor';
$isAbsoluteVendorDir = preg_match('/^(?:[A-Za-z]:[\\\\\/]|[\\\\\/])/', $vendorDir) === 1;
$backendRoot = dirname(__DIR__);
$vendorPath = $isAbsoluteVendorDir
    ? $vendorDir
    : $backendRoot.DIRECTORY_SEPARATOR.$vendorDir;
require $vendorPath.'/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
