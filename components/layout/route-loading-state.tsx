import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function RouteLoadingState() {
    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-52 rounded-xl" />
                    <Skeleton className="h-4 w-64 rounded-xl" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-32 rounded-xl" />
                    <Skeleton className="h-10 w-40 rounded-xl" />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="rounded-[1.5rem]">
                        <CardContent className="space-y-5 p-5">
                            <div className="flex items-start justify-between">
                                <Skeleton className="h-4 w-36 rounded-xl" />
                                <Skeleton className="h-10 w-10 rounded-2xl" />
                            </div>
                            <Skeleton className="h-8 w-32 rounded-xl" />
                            <Skeleton className="h-4 w-24 rounded-xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="rounded-[1.75rem]">
                <CardHeader>
                    <Skeleton className="h-6 w-48 rounded-xl" />
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div
                            key={index}
                            className="rounded-2xl border border-slate-200/80 bg-white/80 p-4"
                        >
                            <Skeleton className="mb-4 h-10 w-16 rounded-2xl" />
                            <Skeleton className="mb-2 h-4 w-28 rounded-xl" />
                            <Skeleton className="h-3 w-20 rounded-xl" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
