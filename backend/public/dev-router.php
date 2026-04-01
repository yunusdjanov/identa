<?php

$requestUri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$publicPath = __DIR__.$requestUri;

if ($requestUri !== '/' && file_exists($publicPath) && !is_dir($publicPath)) {
    return false;
}

require_once __DIR__.'/index.php';
