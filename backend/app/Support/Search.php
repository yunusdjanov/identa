<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * Cross-database case-insensitive search helpers.
 *
 * The default Eloquent `where('col', 'like', '%term%')` is case-INsensitive
 * on MySQL / MariaDB but case-SENSITIVE on PostgreSQL. The mobile keyboard
 * autocapitalize defaults to lowercase, so users typing "test" never match
 * a row stored as "Test" on the Postgres-backed production server.
 *
 * `LOWER(col) LIKE LOWER(?)` works identically on PostgreSQL, MySQL,
 * MariaDB, SQLite and SQL Server — at the cost of skipping a regular B-tree
 * index on `col`. For tables that grow large, add a functional index on
 * `LOWER(col)` (Postgres) or rely on `utf8mb4_*_ci` collations (MySQL).
 *
 * Prefer this helper for any user-typed search; keep raw `'like'` only for
 * machine-generated prefixes (for example, generated record-code lookups)
 * where case is irrelevant.
 */
final class Search
{
    private function __construct() {}

    /**
     * Apply a case-insensitive `LIKE %term%` against a single column.
     *
     * Returns the builder for chaining inside a nested `where(function ... )`
     * group so callers can compose multiple columns with `orWhere` semantics
     * via {@see self::ciLikeAny()}.
     */
    public static function ciLike(Builder $builder, string $column, string $term, string $boolean = 'and'): Builder
    {
        $needle = '%'.mb_strtolower($term).'%';
        $sql = sprintf('LOWER(%s) LIKE ?', $builder->getQuery()->getGrammar()->wrap($column));

        return $builder->whereRaw($sql, [$needle], $boolean);
    }

    /**
     * Match `term` against any of the given columns (OR'd together) wrapped
     * in a single grouped clause so callers can combine it with the rest of
     * their query as a single AND condition.
     *
     * @param  list<string>  $columns
     */
    public static function ciLikeAny(Builder $builder, array $columns, string $term): Builder
    {
        if ($columns === [] || $term === '') {
            return $builder;
        }

        return $builder->where(function (Builder $group) use ($columns, $term): void {
            foreach ($columns as $i => $column) {
                self::ciLike($group, $column, $term, $i === 0 ? 'and' : 'or');
            }
        });
    }
}
