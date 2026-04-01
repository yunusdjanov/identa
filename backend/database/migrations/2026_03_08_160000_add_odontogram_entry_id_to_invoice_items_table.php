<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('invoice_items', function (Blueprint $table): void {
            $table
                ->uuid('odontogram_entry_id')
                ->nullable()
                ->after('invoice_id');

            $table
                ->foreign('odontogram_entry_id')
                ->references('id')
                ->on('odontogram_entries')
                ->nullOnDelete();

            $table->index('odontogram_entry_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invoice_items', function (Blueprint $table): void {
            $table->dropForeign(['odontogram_entry_id']);
            $table->dropIndex(['odontogram_entry_id']);
            $table->dropColumn('odontogram_entry_id');
        });
    }
};
