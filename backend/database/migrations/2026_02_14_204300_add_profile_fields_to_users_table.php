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
        Schema::table('users', function (Blueprint $table): void {
            $table->string('phone', 50)->nullable()->after('email');
            $table->string('practice_name')->nullable()->after('phone');
            $table->string('license_number', 100)->nullable()->after('practice_name');
            $table->string('address')->nullable()->after('license_number');
            $table->time('working_hours_start')->nullable()->after('address');
            $table->time('working_hours_end')->nullable()->after('working_hours_start');
            $table->unsignedSmallInteger('default_appointment_duration')->default(30)->after('working_hours_end');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'phone',
                'practice_name',
                'license_number',
                'address',
                'working_hours_start',
                'working_hours_end',
                'default_appointment_duration',
            ]);
        });
    }
};
