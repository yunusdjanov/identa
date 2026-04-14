'use client';

import { type ComponentProps, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, 'type'> {
    showLabel?: string;
    hideLabel?: string;
}

export function PasswordInput({
    className,
    showLabel = 'Show password',
    hideLabel = 'Hide password',
    disabled,
    ...props
}: PasswordInputProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="relative">
            <Input
                {...props}
                disabled={disabled}
                type={isVisible ? 'text' : 'password'}
                className={cn('pr-12', className)}
            />
            <button
                type="button"
                onClick={() => setIsVisible((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={isVisible ? hideLabel : showLabel}
                disabled={disabled}
            >
                {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
}
