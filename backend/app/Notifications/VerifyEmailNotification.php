<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail as BaseVerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\URL;

/**
 * Branded, localized email-verification notification.
 *
 * Replaces Laravel's stock `VerifyEmail` (which only ships an English
 * Markdown template) with a custom HTML view rendered in the user's UI
 * language. The chosen locale is whatever `SetRequestLocale` middleware
 * resolved for the originating HTTP request — it lives on `App::getLocale()`
 * when the notification is dispatched, so we capture it on construction
 * to keep it stable across queued workers (where the request context is
 * long gone).
 *
 * Renders identa-themed view at `resources/views/mail/verify-email.blade.php`.
 */
class VerifyEmailNotification extends BaseVerifyEmail
{
    /**
     * Locale frozen at dispatch time so the queued worker doesn't render
     * the email in the worker's default locale.
     */
    private string $locale;

    public function __construct()
    {
        // App::getLocale() reflects the current request's resolved locale
        // (the SetRequestLocale middleware sets it from Accept-Language /
        // ?lang query). Falling back to the configured app fallback covers
        // CLI / artisan dispatch (seeders, tinker) where there's no
        // request locale.
        $this->locale = App::getLocale() ?: Config::get('app.fallback_locale', 'en');
    }

    /**
     * @param  mixed  $notifiable
     */
    public function toMail($notifiable): MailMessage
    {
        $verificationUrl = $this->verificationUrl($notifiable);

        // Force the captured locale for both the subject string and the
        // view-side __() calls — Laravel resolves the locale at render
        // time, so without this the queued mail might pick up another
        // request's locale that ran on the same worker.
        App::setLocale($this->locale);

        $expiresAt = Carbon::now()
            ->addMinutes(Config::get('auth.verification.expire', 60));

        return (new MailMessage)
            ->subject(__('notifications.verifyEmail.subject', [
                'app' => Config::get('app.name', 'Identa'),
            ]))
            ->view('mail.verify-email', [
                'verificationUrl' => $verificationUrl,
                'recipientName' => $notifiable->name ?? '',
                'expiresAt' => $expiresAt,
                'locale' => $this->locale,
            ]);
    }

    /**
     * Build the signed-URL exactly the way the parent class does — we
     * override only the rendering, not the URL contract.
     */
    protected function verificationUrl($notifiable): string
    {
        return URL::temporarySignedRoute(
            'verification.verify',
            Carbon::now()->addMinutes(Config::get('auth.verification.expire', 60)),
            [
                'id' => $notifiable->getKey(),
                'hash' => sha1($notifiable->getEmailForVerification()),
            ]
        );
    }
}
