/**
 * Subscription `note` values are written by the backend as fixed English
 * literals for system-driven events (registration, PayX renewal, admin
 * cascades, …) and stored verbatim on `users.subscription_note`. The admin
 * billing UI renders that column directly, so without a display-time
 * translation the English literal leaks into an otherwise localized
 * (RU/UZ) admin screen — e.g. "Public self-service registration" under the
 * Russian "Заметка администратора" header.
 *
 * The same column ALSO holds free-text an admin typed into the subscription
 * dialog, which must be shown as-is. So we translate ONLY exact matches of
 * the known system literals and fall back to the raw note for everything
 * else. Localizing at display time (rather than storing a translated string)
 * is deliberate: the note is admin-facing and must render in the *viewing
 * admin's* locale, not the locale of whoever triggered the event — and it
 * also fixes the rows already persisted in English.
 *
 * Keep this map in sync with the backend literals (search the backend for
 * `startTrial(`, `note:`, `renewOrActivate(`, `markReadOnly(`, …).
 */
export const SYSTEM_NOTE_I18N_KEYS: Record<string, string> = {
    'Public self-service registration': 'admin.billing.note.system.selfRegistration',
    'Google self-service registration': 'admin.billing.note.system.googleRegistration',
    'Google login': 'admin.billing.note.system.googleLogin',
    'Canceled by account owner': 'admin.billing.note.system.ownerCanceled',
    'PayX payment success': 'admin.billing.note.system.payxPaymentSuccess',
    'Admin refund cascade': 'admin.billing.note.system.adminRefundCascade',
    'Trial restarted after account restore.': 'admin.billing.note.system.trialRestarted',
    'Cancelled by admin.dentist.deleted cascade': 'admin.billing.note.system.adminDeletedCascade',
    'Scheduled change without existing subscription': 'admin.billing.note.system.scheduledChangeNoSub',
};

/**
 * Translate a stored subscription note when it is a known system literal,
 * otherwise return the original text (admin free-text notes pass through).
 */
export function localizeSubscriptionNote(
    note: string | null | undefined,
    t: (key: string) => string,
): string {
    if (!note) {
        return '';
    }

    const key = SYSTEM_NOTE_I18N_KEYS[note.trim()];

    return key ? t(key) : note;
}
