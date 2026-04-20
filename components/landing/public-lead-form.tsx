'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/lib/api/client';
import { createPublicLeadRequest } from '@/lib/api/dentist';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getPhoneValidationMessage,
    getTextValidationMessage,
} from '@/lib/input-validation';

interface LandingFormContent {
    name: string;
    phone: string;
    clinic: string;
    city: string;
    note: string;
    optional: string;
    submit: string;
    submitting: string;
    submitted: string;
    submitError: string;
    fixErrors: string;
    telegram: string;
}

interface LandingFormState {
    name: string;
    phone: string;
    clinicName: string;
    city: string;
    note: string;
}

export function PublicLeadForm({
    content,
    telegramHref,
}: {
    content: LandingFormContent;
    telegramHref: string;
}) {
    const [form, setForm] = useState<LandingFormState>({
        name: '',
        phone: '',
        clinicName: '',
        city: '',
        note: '',
    });
    const [isSubmitted, setIsSubmitted] = useState(false);

    const leadRequestMutation = useMutation({
        mutationFn: (payload: {
            name: string;
            phone: string;
            clinic_name: string;
            city: string;
            note?: string;
        }) => createPublicLeadRequest(payload),
        onSuccess: () => {
            toast.success(content.submitted);
            setForm({
                name: '',
                phone: '',
                clinicName: '',
                city: '',
                note: '',
            });
            setIsSubmitted(false);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, content.submitError));
        },
    });

    const errors = useMemo(
        () => ({
            name: getTextValidationMessage(form.name, {
                label: content.name,
                required: true,
                min: 2,
                max: INPUT_LIMITS.personName,
            }),
            phone: getPhoneValidationMessage(form.phone, { required: true }),
            clinicName: getTextValidationMessage(form.clinicName, {
                label: content.clinic,
                required: true,
                min: 2,
                max: INPUT_LIMITS.practiceName,
            }),
            city: getTextValidationMessage(form.city, {
                label: content.city,
                required: true,
                min: 2,
                max: INPUT_LIMITS.shortText,
            }),
            note: getTextValidationMessage(form.note, {
                label: content.note,
                required: false,
                max: INPUT_LIMITS.longText,
            }),
        }),
        [content.city, content.clinic, content.name, content.note, form]
    );

    const hasErrors = Boolean(errors.name || errors.phone || errors.clinicName || errors.city || errors.note);

    const handleLeadRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitted(true);

        if (hasErrors) {
            toast.error(content.fixErrors);
            return;
        }

        await leadRequestMutation.mutateAsync({
            name: form.name.trim(),
            phone: form.phone.trim(),
            clinic_name: form.clinicName.trim(),
            city: form.city.trim(),
            note: form.note.trim() || undefined,
        });
    };

    return (
        <form className="flex h-full flex-col gap-4" onSubmit={handleLeadRequestSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-800">
                        {content.name} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        maxLength={INPUT_LIMITS.personName}
                        aria-invalid={Boolean(isSubmitted && errors.name)}
                        placeholder={content.name}
                    />
                    {isSubmitted && errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-800">
                        {content.phone} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={form.phone}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                phone: formatPhoneInputValue(event.target.value),
                            }))
                        }
                        maxLength={INPUT_LIMITS.phoneFormatted}
                        inputMode="tel"
                        aria-invalid={Boolean(isSubmitted && errors.phone)}
                        placeholder="+998 90 123 45 67"
                    />
                    {isSubmitted && errors.phone ? <p className="text-xs text-red-600">{errors.phone}</p> : null}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-800">
                        {content.clinic} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={form.clinicName}
                        onChange={(event) => setForm((current) => ({ ...current, clinicName: event.target.value }))}
                        maxLength={INPUT_LIMITS.practiceName}
                        aria-invalid={Boolean(isSubmitted && errors.clinicName)}
                        placeholder={content.clinic}
                    />
                    {isSubmitted && errors.clinicName ? (
                        <p className="text-xs text-red-600">{errors.clinicName}</p>
                    ) : null}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-800">
                        {content.city} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={form.city}
                        onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                        maxLength={INPUT_LIMITS.shortText}
                        aria-invalid={Boolean(isSubmitted && errors.city)}
                        placeholder={content.city}
                    />
                    {isSubmitted && errors.city ? <p className="text-xs text-red-600">{errors.city}</p> : null}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                    {content.note} <span className="text-slate-400">({content.optional})</span>
                </label>
                <Textarea
                    value={form.note}
                    onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    maxLength={INPUT_LIMITS.longText}
                    aria-invalid={Boolean(isSubmitted && errors.note)}
                    placeholder={content.note}
                    className="min-h-28"
                />
                {isSubmitted && errors.note ? <p className="text-xs text-red-600">{errors.note}</p> : null}
            </div>

            <div className="mt-auto flex flex-col gap-3 sm:flex-row">
                <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-xl px-4 text-sm sm:flex-1 sm:text-base"
                    disabled={leadRequestMutation.isPending}
                >
                    {leadRequestMutation.isPending ? content.submitting : content.submit}
                    <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                    asChild
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 w-full rounded-xl px-5 text-sm sm:w-auto sm:text-base"
                >
                    <a href={telegramHref} target="_blank" rel="noreferrer">
                        {content.telegram}
                    </a>
                </Button>
            </div>
        </form>
    );
}
