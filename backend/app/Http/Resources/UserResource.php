<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function __construct(User $resource)
    {
        parent::__construct($resource);
    }

    /**
     * Subscription summary fields that carry billing-private information
     * the dentist owner sees in their own /auth/me but assistants and
     * non-owner viewers should NOT see. `payment_amount` is the owner's
     * monthly fee in their plan's currency; `note` is the admin-entered
     * note attached when an admin manually overrides the subscription.
     * Neither is the assistant's concern — they inherit plan LIMITS
     * (staff_limit, entry_image_limit, can_export, upload caps), not the
     * billing details that prove how the dentist pays for them.
     */
    private const OWNER_ONLY_SUBSCRIPTION_FIELDS = [
        'payment_amount',
        'note',
        'payment_method',
        // Pending change is the dentist owner's planned downgrade /
        // cancellation intent. Assistants don't need to anticipate that
        // their boss has scheduled a plan switch — surfacing it lets
        // them forecast "I'll be locked out next month," which is
        // owner-level planning, not staff workflow. Strip alongside the
        // billing-amount fields above.
        'pending_plan_id',
        'pending_plan_code',
        'pending_plan_name',
        'pending_billing_period',
        'pending_change_effective_at',
        'cancel_at_period_end',
        'cancelled_at',
    ];

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        $subscriptionOwner = $user->subscriptionOwner();
        $subscription = $subscriptionOwner?->subscriptionSummary();
        if ($subscription !== null && $subscriptionOwner !== null) {
            // When the resource is serializing a viewer who is NOT the
            // subscription's owner (e.g. an assistant's /auth/me, or an
            // admin viewing a dentist) we still emit plan limits but
            // strip billing-private fields. The owner viewing their own
            // /auth/me keeps the full payload so they can see their fee.
            $viewer = $request->user();
            $isOwnerViewing = $viewer instanceof User
                && (int) $viewer->id === (int) $subscriptionOwner->id;
            $isAdminViewing = $viewer instanceof User && $viewer->isAdmin();
            if (! $isOwnerViewing && ! $isAdminViewing) {
                foreach (self::OWNER_ONLY_SUBSCRIPTION_FIELDS as $key) {
                    if (array_key_exists($key, $subscription)) {
                        $subscription[$key] = null;
                    }
                }
            }
        }

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'provider' => $user->provider,
            'avatar_url' => $user->avatar_url,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'email_verified' => $user->hasVerifiedEmail(),
            'has_password' => $user->password !== null,
            // Tells the Settings → Connected Accounts panel whether the
            // Google identity is currently bound to this user, regardless
            // of which provider they originally signed up with. We never
            // emit the raw `google_id` (Google's stable subject) since
            // it's PII of limited value to the client.
            'google_linked' => $user->google_id !== null,
            'account_status' => $user->account_status,
            'dentist_owner_id' => $user->dentist_owner_id !== null ? (string) $user->dentist_owner_id : null,
            'assistant_permissions' => User::normalizeAssistantPermissions($user->assistant_permissions ?? []),
            'must_change_password' => (bool) $user->must_change_password,
            'show_record_authors' => (bool) $user->show_record_authors,
            'subscription' => $subscription,
        ];
    }
}
