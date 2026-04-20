<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('phone', 32);
            $table->string('clinic_name');
            $table->string('city');
            $table->text('note')->nullable();
            $table->string('status', 20)->default('new');
            $table->foreignId('handled_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('handled_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_requests');
    }
};
