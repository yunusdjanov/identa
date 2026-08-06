<?php

$basePath = dirname(__DIR__);

$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'testing';
$_SERVER['APP_ENV'] = $_SERVER['APP_ENV'] ?? 'testing';
putenv('APP_ENV='.$_ENV['APP_ENV']);

// Keep Laravel's inferred base path anchored to this checkout when vendor/
// is shared by a sibling worktree during local test runs.
$_ENV['APP_BASE_PATH'] = $_ENV['APP_BASE_PATH'] ?? $basePath;
$_SERVER['APP_BASE_PATH'] = $_SERVER['APP_BASE_PATH'] ?? $_ENV['APP_BASE_PATH'];
putenv('APP_BASE_PATH='.$_ENV['APP_BASE_PATH']);

$configuredVendorDirectory = getenv('COMPOSER_VENDOR_DIR');
$vendorDirectory = is_string($configuredVendorDirectory) && $configuredVendorDirectory !== ''
    ? $configuredVendorDirectory
    : 'vendor';
$autoloadPath = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $vendorDirectory) === 1
    ? rtrim($vendorDirectory, '\\/').'/autoload.php'
    : $basePath.'/'.trim($vendorDirectory, '\\/').'/autoload.php';

require $autoloadPath;
