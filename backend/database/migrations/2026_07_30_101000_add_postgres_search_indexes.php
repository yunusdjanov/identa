<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * PostgreSQL cannot create concurrent indexes inside a transaction.
     */
    public $withinTransaction = false;

    /**
     * Add targeted trigram indexes for the user-facing contains searches that
     * cannot use ordinary B-tree indexes. Other database engines keep their
     * native case-insensitive collation behavior and skip this migration.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        foreach ($this->indexes() as $name => [$table, $column]) {
            DB::statement(sprintf(
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS %s ON %s USING gin (LOWER(%s) gin_trgm_ops)',
                $name,
                $table,
                $column
            ));
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        foreach (array_keys($this->indexes()) as $name) {
            DB::statement("DROP INDEX CONCURRENTLY IF EXISTS {$name}");
        }
    }

    /**
     * Keep the index set deliberately small: each additional GIN index makes
     * writes and storage more expensive.
     *
     * @return array<string, array{string, string}>
     */
    private function indexes(): array
    {
        return [
            'patients_full_name_trgm_idx' => ['patients', 'full_name'],
            'patients_phone_trgm_idx' => ['patients', 'phone'],
            'patients_patient_id_trgm_idx' => ['patients', 'patient_id'],
            'payment_expenses_title_trgm_idx' => ['payment_expenses', 'title'],
            'treatments_type_trgm_idx' => ['treatments', 'treatment_type'],
        ];
    }
};
