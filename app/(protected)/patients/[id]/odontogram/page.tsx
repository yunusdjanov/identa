import { redirect } from 'next/navigation';

/**
 * Backward-compatible route for old bookmarks and shared links.
 * Clinical work now lives exclusively in the patient history surface.
 */
export default async function LegacyOdontogramPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    redirect(`/patients/${encodeURIComponent(id)}/history`);
}
