<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('landing_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('currency', 10)->default('UZS');
            $table->unsignedBigInteger('trial_price_amount')->default(0);
            $table->unsignedBigInteger('monthly_price_amount')->default(450000);
            $table->unsignedBigInteger('yearly_price_amount')->default(4500000);
            $table->string('telegram_contact_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landing_settings');
    }
};
