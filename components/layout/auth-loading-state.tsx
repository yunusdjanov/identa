import { Brand } from '@/components/branding/brand';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function AuthLoadingState() {
    return (
        <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
            <div className="w-full max-w-md">
                <div className="mb-8 flex flex-col items-center gap-3">
                    <Brand href="/" variant="text" priority textClassName="w-40 sm:w-44" />
                    <Skeleton className="h-4 w-44 rounded-xl" />
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <Skeleton className="mx-auto h-7 w-44 rounded-xl" />
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16 rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20 rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                        </div>
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-36 rounded-xl" />
                            <Skeleton className="h-4 w-28 rounded-xl" />
                        </div>
                        <Skeleton className="h-11 w-full rounded-xl" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
