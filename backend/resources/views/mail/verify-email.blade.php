{{--
    Branded transactional email — verify email address.

    Important constraints kept in mind:
      - **Inline styles only.** Gmail / Apple Mail / Outlook strip <style>
        blocks, attribute selectors, and most modern CSS. Every visual
        rule lives on the element it styles.
      - **<table> based layout.** Outlook for Windows uses Word's HTML
        engine and ignores flexbox / grid / margins. A two-level table
        (outer 100%, inner 600px max) is the only reliable centering
        pattern.
      - **Dark-mode tolerant.** Forced light background (#f6f8fb) so
        Gmail's auto-dark-mode doesn't invert the brand teal.
      - **Plain-text fallback URL.** Repeated under a "trouble clicking?"
        banner — required for anti-phishing visibility and a11y per
        transactional-email best practice (Stripe / GitHub / Vercel
        pattern).
--}}
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="{{ $locale ?? 'en' }}">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>{{ __('notifications.verifyEmail.subject', ['app' => config('app.name', 'Identa')]) }}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f6f8fb;">
    <tr>
        <td align="center" style="padding:32px 16px;">
            {{-- Outer card --}}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);overflow:hidden;">
                {{-- Brand bar --}}
                <tr>
                    <td style="background:linear-gradient(135deg,#0d9488 0%,#14b8a6 100%);padding:22px 32px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                                <td style="font-size:18px;font-weight:700;letter-spacing:0.2px;color:#ffffff;">
                                    {{ config('app.name', 'Identa') }}
                                </td>
                                <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.85);">
                                    {{ __('notifications.verifyEmail.tag') }}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                {{-- Body --}}
                <tr>
                    <td style="padding:36px 32px 8px 32px;">
                        @if (! empty($recipientName))
                            <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#0f766e;">
                                {{ __('notifications.verifyEmail.greeting', ['name' => $recipientName]) }}
                            </p>
                        @endif
                        <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.35;font-weight:700;color:#0f172a;">
                            {{ __('notifications.verifyEmail.headline') }}
                        </h1>
                        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#475569;">
                            {{ __('notifications.verifyEmail.intro') }}
                        </p>
                    </td>
                </tr>

                {{-- CTA --}}
                <tr>
                    <td align="center" style="padding:0 32px 28px 32px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                                <td style="border-radius:10px;background-color:#0d9488;">
                                    <a href="{{ $verificationUrl }}"
                                       style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background-color:#0d9488;mso-line-height-rule:exactly;line-height:20px;">
                                        {{ __('notifications.verifyEmail.cta') }}
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                {{-- Meta line --}}
                <tr>
                    <td style="padding:0 32px 4px 32px;">
                        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#64748b;">
                            {{ __('notifications.verifyEmail.expires', ['minutes' => 60]) }}
                        </p>
                    </td>
                </tr>

                {{-- Disclaimer --}}
                <tr>
                    <td style="padding:4px 32px 24px 32px;">
                        <p style="margin:0;font-size:13px;line-height:1.65;color:#64748b;">
                            {{ __('notifications.verifyEmail.disclaimer') }}
                        </p>
                    </td>
                </tr>

                {{-- URL fallback --}}
                <tr>
                    <td style="padding:0 32px 28px 32px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top:1px solid #e2e8f0;">
                            <tr>
                                <td style="padding-top:18px;">
                                    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.55;color:#94a3b8;">
                                        {{ __('notifications.verifyEmail.trouble') }}
                                    </p>
                                    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
                                        <a href="{{ $verificationUrl }}" style="color:#0d9488;text-decoration:none;">{{ $verificationUrl }}</a>
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                {{-- Footer --}}
                <tr>
                    <td style="background-color:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;">
                        <p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8;text-align:center;">
                            {{ __('notifications.footer.copyright', [
                                'app' => config('app.name', 'Identa'),
                                'year' => now()->year,
                            ]) }}
                        </p>
                        <p style="margin:6px 0 0 0;font-size:12px;line-height:1.55;color:#94a3b8;text-align:center;">
                            {{ __('notifications.footer.tagline') }}
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
