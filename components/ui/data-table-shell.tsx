import * as React from 'react';

import { cn } from '@/lib/utils';

type DataTableVariant = 'standard' | 'history';

const SHELL_VARIANT_CLASS: Record<DataTableVariant, string> = {
    standard: 'min-w-0 max-w-full overflow-x-auto rounded-[1.35rem] border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/50',
    history: 'min-w-0 max-w-full overflow-x-auto rounded-[1.35rem] border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/50',
};

const TABLE_VARIANT_CLASS: Record<DataTableVariant, string> = {
    standard:
        'w-full text-slate-700 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-blue-50/35 [&_thead]:bg-slate-50/80 [&_th]:h-11 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-3',
    history:
        'w-full text-slate-700 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-blue-50/35 [&_thead]:bg-slate-50/80 [&_th]:h-11 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-slate-500 [&_td]:px-4 [&_td]:py-3.5',
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

