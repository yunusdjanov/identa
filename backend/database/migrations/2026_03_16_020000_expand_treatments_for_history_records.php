<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('treatments', function (Blueprint $table): void {
            $table->json('teeth')->nullable()->after('tooth_number');
            $table->text('comment')->nullable()->after('description');
            $table->decimal('debt_amount', 12, 2)->default(0)->after('cost');
            $table->decimal('paid_amount', 12, 2)->default(0)->after('debt_amount');
            $table->string('before_image_disk')->nullable()->after('paid_amount');
            $table->string('before_image_path')->nullable()->after('before_image_disk');
            $table->string('after_image_disk')->nullable()->after('before_image_path');
            $table->string('after_image_path')->nullable()->after('after_image_disk');
            $table->index(['dentist_id', 'patient_id', 'treatment_date', 'created_at'], 'treatments_history_lookup_idx');
        });

        DB::table('treatments')
            ->select(['id', 'tooth_number', 'cost', 'notes'])
            ->orderBy('created_at')
            ->lazy()
            ->each(function (object $row): void {
                DB::table('treatments')
                    ->where('id', $row->id)
                    ->update([
                        'teeth' => $row->tooth_number !== null ? json_encode([(int) $row->tooth_number], JSON_THROW_ON_ERROR) : null,
                        'comment' => is_string($row->notes) && $row->notes !== '' ? $row->notes : null,
                        'debt_amount' => $row->cost ?? '0.00',
                        'paid_amount' => '0.00',
                    ]);
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('treatments', function (Blueprint $table): void {
            $table->dropIndex('treatments_history_lookup_idx');
            $table->dropColumn([
                'teeth',
                'comment',
                'debt_amount',
                'paid_amount',
                'before_image_disk',
                'before_image_path',
                'after_image_disk',
                'after_image_path',
            ]);
        });
    }
};
