import * as React from 'react';

import { cn } from '@/lib/utils';

type DataTableVariant = 'standard' | 'history';

const SHELL_VARIANT_CLASS: Record<DataTableVariant, string> = {
    standard: 'overflow-x-auto rounded-xl border border-gray-200 bg-white',
    history: 'overflow-x-auto rounded-2xl border border-gray-200 bg-white',
};

const TABLE_VARIANT_CLASS: Record<DataTableVariant, string> = {
    standard:
        'w-full [&_thead]:bg-gray-50 [&_th]:h-11 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-3',
    history:
        'w-full [&_thead]:bg-gray-50 [&_th]:h-11 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-3.5',
};

interface DataTableShellProps extends React.ComponentProps<'div'> {
    variant?: DataTableVariant;
}

function DataTableShell({
    variant = 'standard',
    className,
    ...props
}: DataTableShellProps) {
    return (
        <div
            className={cn(SHELL_VARIANT_CLASS[variant], className)}
            {...props}
        />
    );
}

function getDataTableClassName(variant: DataTableVariant = 'standard') {
    return TABLE_VARIANT_CLASS[variant];
}

export {
    DataTableShell,
    getDataTableClassName,
};

