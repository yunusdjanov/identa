'use client';

import { Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface AppointmentTimePickerProps {
    id: string;
    value: string;
    options: string[];
    onValueChange: (value: string) => void;
    placeholder: string;
    emptyLabel: string;
    disabled?: boolean;
    ariaInvalid?: boolean;
    className?: string;
}

export function AppointmentTimePicker({
    id,
    value,
    options,
    onValueChange,
    placeholder,
    emptyLabel,
    disabled = false,
    ariaInvalid = false,
    className,
}: AppointmentTimePickerProps) {
    const hasOptions = options.length > 0;
    const displayValue = value || placeholder;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled || !hasOptions}
                    aria-invalid={ariaInvalid}
                    className={cn(
                        'h-9 w-full justify-between rounded-xl border-slate-200 bg-white px-3 font-normal shadow-xs hover:bg-slate-50 focus-visible:border-slate-300 focus-visible:ring-0',
                        !value && 'text-slate-500',
                        className
                    )}
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <Clock3 className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{displayValue}</span>
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        {options.length}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                sideOffset={6}
                collisionPadding={16}
                className="max-h-52 w-[var(--radix-dropdown-menu-trigger-width)] min-w-48 overflow-y-auto rounded-xl border-slate-200 bg-white p-2 shadow-md"
            >
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {placeholder}
                </DropdownMenuLabel>
                {hasOptions ? (
                    <div className="grid grid-cols-3 gap-1.5">
                        {options.map((option) => (
                            <DropdownMenuItem
                                key={option}
                                onSelect={() => onValueChange(option)}
                                className={cn(
                                    'justify-center rounded-lg border border-transparent px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-700 focus:bg-slate-50 focus:text-slate-900',
                                    option === value
                                        ? 'border-blue-200 bg-blue-50 text-blue-700 focus:border-blue-200 focus:bg-blue-50 focus:text-blue-700'
                                        : 'hover:border-slate-200 hover:bg-slate-50'
                                )}
                            >
                                {option}
                            </DropdownMenuItem>
                        ))}
                    </div>
                ) : (
                    <p className="px-2 py-3 text-sm text-slate-500">{emptyLabel}</p>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
