<?php

$basePath = dirname(__DIR__);

$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? 'testing';
$_SERVER['APP_ENV'] = $_SERVER['APP_ENV'] ?? 'testing';
putenv('APP_ENV='.$_ENV['APP_ENV']);

require $basePath.'/vendor/autoload.php';
