'use client';

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface PatientPhotoPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    src?: string | null;
    alt: string;
    title: string;
}

export function PatientPhotoPreviewDialog({
    open,
    onOpenChange,
    src,
    alt,
    title,
}: PatientPhotoPreviewDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="max-w-[36rem] gap-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
            >
                <div className="flex items-center justify-between px-5 pb-0 pt-5 sm:px-6 sm:pt-5">
                    <DialogTitle className="truncate pr-4 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                        {title}
                    </DialogTitle>
                    <DialogClose className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900">
                        <X className="h-4.5 w-4.5" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </div>
                {src ? (
                    <div className="px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
                        <div className="overflow-hidden rounded-2xl bg-slate-50 p-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={src}
                                alt={alt}
                                className="max-h-[68vh] w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
