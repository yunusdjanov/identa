'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ConfirmActionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    onConfirm: () => void;
    confirmLabel?: string;
    pendingLabel?: string;
    cancelLabel?: string;
    confirmVariant?: 'default' | 'destructive';
    disabled?: boolean;
    isPending?: boolean;
    className?: string;
    /**
     * When set, the user must type this exact text to enable the confirm
     * button — used to guard irreversible actions (e.g. permanent deletion).
     */
    requireConfirmationText?: string;
    confirmationLabel?: string;
    confirmationPlaceholder?: string;
}

export function ConfirmActionDialog({
    open,
    onOpenChange,
    title,
    description,
    onConfirm,
    confirmLabel = 'Confirm',
    pendingLabel = 'Processing...',
    cancelLabel = 'Cancel',
    confirmVariant = 'destructive',
    disabled = false,
    isPending = false,
    className = 'max-w-md',
    requireConfirmationText,
    confirmationLabel,
    confirmationPlaceholder,
}: ConfirmActionDialogProps) {
    const isDestructive = confirmVariant === 'destructive';
    const Icon = isDestructive ? AlertTriangle : CheckCircle2;

    const [typedConfirmation, setTypedConfirmation] = useState('');
    // Reset the typed text whenever the dialog is toggled so a previous match
    // never carries over to the next open. Done during render (React's "adjust
    // state when a value changes" pattern) rather than in an effect.
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (!open) {
            setTypedConfirmation('');
        }
    }

    const needsTypedConfirmation = typeof requireConfirmationText === 'string' && requireConfirmationText.trim() !== '';
    const typedMatches = !needsTypedConfirmation
        || typedConfirmation.trim() === (requireConfirmationText ?? '').trim();
    const confirmDisabled = disabled || isPending || !typedMatches;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn('overflow-hidden p-0', className)}>
                <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
                    <div className="flex gap-4">
                        <span
                            className={cn(
                                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm',
                                isDestructive
                                    ? 'border-red-100 bg-red-50 text-red-600 shadow-red-100/60'
                                    : 'border-emerald-100 bg-emerald-50 text-emerald-600 shadow-emerald-100/60'
                            )}
                            aria-hidden="true"
                        >
                            <Icon className="h-5 w-5" />
                        </span>
                        <DialogHeader className="min-w-0 flex-1 pr-8 text-left">
                            <DialogTitle className="text-xl">{title}</DialogTitle>
                            <DialogDescription className="text-base leading-6 text-slate-600">
                                {description}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    {needsTypedConfirmation ? (
                        <div className="mt-4 space-y-1.5">
                            {confirmationLabel ? (
                                <Label className="text-xs font-medium text-slate-600">{confirmationLabel}</Label>
                            ) : null}
                            <Input
                                value={typedConfirmation}
                                onChange={(event) => setTypedConfirmation(event.target.value)}
                                placeholder={confirmationPlaceholder ?? requireConfirmationText}
                                disabled={isPending}
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                aria-label={confirmationLabel ?? title}
                            />
                        </div>
                    ) : null}
                </div>
                <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isPending}
                        className="h-10 min-w-24 rounded-xl"
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant={confirmVariant}
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                        className={cn(
                            'h-10 min-w-32 rounded-xl shadow-sm',
                            isDestructive ? 'shadow-red-200/50' : 'shadow-teal-200/50'
                        )}
                    >
                        {isPending ? pendingLabel : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

