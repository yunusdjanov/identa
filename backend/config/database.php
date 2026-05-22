<?php

use Illuminate\Support\Str;

$databaseUrl = env('DB_URL')
    ?: env('DATABASE_URL')
    ?: env('DATABASE_PRIVATE_URL')
    ?: env('POSTGRES_URL')
    ?: env('POSTGRES_PRIVATE_URL')
    ?: env('POSTGRES_PRISMA_URL')
    ?: env('POSTGRES_URL_NON_POOLING')
    ?: env('MYSQL_URL')
    ?: env('MYSQL_PRIVATE_URL');
$databaseUrlScheme = is_string($databaseUrl) ? parse_url($databaseUrl, PHP_URL_SCHEME) : null;
$databaseUrlDriver = match ($databaseUrlScheme) {
    'mysql', 'mariadb', 'sqlite', 'sqlsrv' => $databaseUrlScheme,
    'postgres', 'postgresql' => 'pgsql',
    default => 'sqlite',
};
$hasPostgresEnv = $databaseUrlDriver === 'pgsql'
    || env('PGHOST')
    || env('POSTGRES_HOST')
    || env('PGDATABASE')
    || env('POSTGRES_DB')
    || env('POSTGRES_DATABASE');
$hasMysqlEnv = in_array($databaseUrlDriver, ['mysql', 'mariadb'], true)
    || env('MYSQLHOST')
    || env('MYSQL_HOST')
    || env('MYSQLDATABASE')
    || env('MYSQL_DATABASE');
$defaultConnection = env(
    'DB_CONNECTION',
    $databaseUrl
        ? $databaseUrlDriver
        : ($hasPostgresEnv ? 'pgsql' : ($hasMysqlEnv ? 'mysql' : 'sqlite'))
);

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations. This is
    | the connection which will be utilized unless another connection
    | is explicitly specified when you execute a query / statement.
    |
    */

    'default' => $defaultConnection,

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Below are all of the database connections defined for your application.
    | An example configuration is provided for each database system which
    | is supported by Laravel. You're free to add / remove connections.
    |
    */

    'connections' => [

        'sqlite' => [
            'driver' => 'sqlite',
            'url' => $databaseUrl,
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
            'transaction_mode' => 'DEFERRED',
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => $databaseUrl,
            'host' => env('DB_HOST') ?: env('MYSQLHOST') ?: env('MYSQL_HOST', '127.0.0.1'),
            'port' => env('DB_PORT') ?: env('MYSQLPORT') ?: env('MYSQL_PORT', '3306'),
            'database' => env('DB_DATABASE') ?: env('MYSQLDATABASE') ?: env('MYSQL_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME') ?: env('MYSQLUSER') ?: env('MYSQL_USER', 'root'),
            'password' => env('DB_PASSWORD') ?: env('MYSQLPASSWORD') ?: env('MYSQL_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                (PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_SSL_CA : \PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'mariadb' => [
            'driver' => 'mariadb',
            'url' => $databaseUrl,
            'host' => env('DB_HOST') ?: env('MYSQLHOST') ?: env('MYSQL_HOST', '127.0.0.1'),
            'port' => env('DB_PORT') ?: env('MYSQLPORT') ?: env('MYSQL_PORT', '3306'),
            'database' => env('DB_DATABASE') ?: env('MYSQLDATABASE') ?: env('MYSQL_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME') ?: env('MYSQLUSER') ?: env('MYSQL_USER', 'root'),
            'password' => env('DB_PASSWORD') ?: env('MYSQLPASSWORD') ?: env('MYSQL_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                (PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_SSL_CA : \PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'pgsql' => [
            'driver' => 'pgsql',
            'url' => $databaseUrl,
            'host' => env('DB_HOST') ?: env('PGHOST') ?: env('POSTGRES_HOST', '127.0.0.1'),
            'port' => env('DB_PORT') ?: env('PGPORT') ?: env('POSTGRES_PORT', '5432'),
            'database' => env('DB_DATABASE') ?: env('PGDATABASE') ?: env('POSTGRES_DB') ?: env('POSTGRES_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME') ?: env('PGUSER') ?: env('POSTGRES_USER', 'root'),
            'password' => env('DB_PASSWORD') ?: env('PGPASSWORD') ?: env('POSTGRES_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
        ],

        'sqlsrv' => [
            'driver' => 'sqlsrv',
            'url' => $databaseUrl,
            'host' => env('DB_HOST', 'localhost'),
            'port' => env('DB_PORT', '1433'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            // 'encrypt' => env('DB_ENCRYPT', 'yes'),
            // 'trust_server_certificate' => env('DB_TRUST_SERVER_CERTIFICATE', 'false'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system
    | such as Memcached. You may define your connection settings here.
    |
    */

    'redis' => [

        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug((string) env('APP_NAME', 'laravel')).'-database-'),
            'persistent' => env('REDIS_PERSISTENT', false),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
        ],

    ],

];
