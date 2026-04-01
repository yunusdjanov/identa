'use client';

import type { RefObject } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { UploadCloud, ImageOff, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function getPatientInitials(fullName: string): string | null {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return null;
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

interface PatientPhotoFieldProps {
    id: string;
    label: string;
    hint: string;
    replaceLabel: string;
    changeLabel: string;
    removeLabel: string;
    dropTitle: string;
    selectedTitle: string;
    currentTitle: string;
    noFileLabel: string;
    patientName: string;
    inputKey: number;
    inputRef: RefObject<HTMLInputElement | null>;
    selectedFile: File | null;
    currentPhotoUrl?: string | null;
    onPickClick: () => void;
    onSelectFile: (file: File | null) => void;
    onClearSelection?: () => void;
    onRemoveCurrent?: () => void;
    hideLabel?: boolean;
}

export function PatientPhotoField({
    id,
    label,
    hint,
    replaceLabel,
    changeLabel,
    removeLabel,
    dropTitle,
    selectedTitle,
    currentTitle,
    noFileLabel,
    patientName,
    inputKey,
    inputRef,
    selectedFile,
    currentPhotoUrl,
    onPickClick,
    onSelectFile,
    onClearSelection,
    onRemoveCurrent,
    hideLabel = false,
}: PatientPhotoFieldProps) {
    const [isDragActive, setIsDragActive] = useState(false);
    const objectUrl = useMemo(() => (
        selectedFile ? URL.createObjectURL(selectedFile) : null
    ), [selectedFile]);

    useEffect(() => {
        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [objectUrl]);

    const previewUrl = objectUrl ?? currentPhotoUrl ?? undefined;
    const hasCurrentPhoto = Boolean(currentPhotoUrl);
    const hasSelectedFile = Boolean(selectedFile);
    const hasAnyPhoto = hasSelectedFile || hasCurrentPhoto;
    const initials = getPatientInitials(patientName);
    const fileLabel = selectedFile?.name ?? (hasCurrentPhoto ? currentTitle : noFileLabel);
    const panelTitle = hasAnyPhoto ? selectedTitle : dropTitle;
    const showRemoveCurrent = Boolean(onRemoveCurrent && hasCurrentPhoto && !selectedFile);
    const showClearSelection = Boolean(onClearSelection && hasSelectedFile);

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragActive(false);
        onSelectFile(event.dataTransfer.files?.[0] ?? null);
    };

    return (
        <div className="space-y-2">
            {hideLabel ? null : <Label htmlFor={id} className="text-sm text-gray-700">{label}</Label>}
            <div className="flex min-w-0 items-start gap-3">
                <Avatar key={previewUrl ?? 'photo-placeholder'} className="h-16 w-16 shrink-0 border border-slate-200 bg-blue-50">
                    {previewUrl ? <AvatarImage src={previewUrl} alt={patientName} /> : null}
                    <AvatarFallback className="bg-blue-50 text-blue-700 text-xl font-semibold">
                        {initials ? initials : <User className="h-6 w-6 text-blue-400" />}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
                    <input
                        key={inputKey}
                        ref={inputRef}
                        id={id}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
                        className="sr-only"
                    />
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={onPickClick}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onPickClick();
                            }
                        }}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setIsDragActive(true);
                        }}
                        onDragLeave={() => setIsDragActive(false)}
                        onDrop={handleDrop}
                        className={cn(
                            'flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50 px-4 text-center transition-colors',
                            isDragActive
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                        )}
                    >
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <UploadCloud className="h-4 w-4" />
                            <span>{panelTitle}</span>
                        </div>
                        <span className="mt-1 text-xs text-slate-500">{hint}</span>
                    </div>
                    {hasAnyPhoto ? (
                        <div className="grid min-w-0 w-full grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 shrink-0 px-2.5 text-xs"
                                onClick={onPickClick}
                            >
                                {replaceLabel || changeLabel}
                            </Button>
                            {showClearSelection ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 border-red-200 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={onClearSelection}
                                >
                                    <ImageOff className="mr-1 h-3.5 w-3.5" />
                                    {removeLabel}
                                </Button>
                            ) : null}
                            {showRemoveCurrent ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 border-red-200 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={onRemoveCurrent}
                                >
                                    <ImageOff className="mr-1 h-3.5 w-3.5" />
                                    {removeLabel}
                                </Button>
                            ) : null}
                            <span className="min-w-0 max-w-full truncate text-xs text-slate-500" title={fileLabel}>
                                {fileLabel}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
