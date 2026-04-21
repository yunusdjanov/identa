import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type BrandVariant = 'icon' | 'text' | 'full' | 'lockup';

interface BrandProps {
    variant?: BrandVariant;
    href?: string;
    priority?: boolean;
    className?: string;
    iconClassName?: string;
    textClassName?: string;
    fullClassName?: string;
}

function BrandContent({
    variant,
    priority = false,
    className,
    iconClassName,
    textClassName,
    fullClassName,
}: Omit<BrandProps, 'href'>) {
    if (variant === 'icon') {
        return (
            <Image
                src="/brand/identa-icon-only.png"
                alt="Identa"
                width={510}
                height={440}
                priority={priority}
                className={cn('h-auto w-10', iconClassName, className)}
            />
        );
    }

    if (variant === 'text') {
        return (
            <Image
                src="/brand/identa-text-only.png"
                alt="Identa"
                width={640}
                height={240}
                priority={priority}
                className={cn('h-auto w-32', textClassName, className)}
            />
        );
    }

    if (variant === 'full') {
        return (
            <Image
                src="/brand/identa-full-logo.png"
                alt="Identa"
                width={580}
                height={680}
                priority={priority}
                className={cn('h-auto w-36', fullClassName, className)}
            />
        );
    }

    return (
        <div className={cn('flex items-center gap-3', className)}>
            <Image
                src="/brand/identa-icon-only.png"
                alt="Identa icon"
                width={510}
                height={440}
                priority={priority}
                className={cn('h-auto w-11', iconClassName)}
            />
            <Image
                src="/brand/identa-text-only.png"
                alt="Identa"
                width={640}
                height={240}
                priority={priority}
                className={cn('h-auto w-28', textClassName)}
            />
        </div>
    );
}

export function Brand(props: BrandProps) {
    const { href, ...rest } = props;

    if (href) {
        return (
            <Link href={href} aria-label="Identa home">
                <BrandContent {...rest} />
            </Link>
        );
    }

    return <BrandContent {...rest} />;
}
