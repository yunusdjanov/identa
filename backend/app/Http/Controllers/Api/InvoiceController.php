<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Services\InvoicePdfService;
use App\Services\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class InvoiceController extends Controller
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly InvoicePdfService $pdfs,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->invoices->list($request);
        $invoices = $result['invoices'];

        return response()->json([
            'data' => $invoices
                ->getCollection()
                ->map(fn (Invoice $invoice): array => $this->transformInvoice($invoice))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $invoices->currentPage(),
                    'per_page' => $invoices->perPage(),
                    'total' => $invoices->total(),
                    'total_pages' => $invoices->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        return response()->json([
            'data' => $this->transformInvoice($this->invoices->create($request), true),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $invoice = $this->invoices
            ->ownedInvoice($request, $id)
            ->load(['items', 'patient:id,full_name,phone']);

        return response()->json([
            'data' => $this->transformInvoice($invoice, true),
        ]);
    }

    public function update(UpdateInvoiceRequest $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transformInvoice($this->invoices->update($request, $id), true),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->invoices->delete($request, $id);

        return response()->json([], 204);
    }

    public function download(Request $request, string $id): Response
    {
        $invoice = $this->invoices->invoiceForPdf($request, $id);
        $filename = sprintf('%s.pdf', $invoice->invoice_number);

        return response($this->pdfs->build($invoice), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => sprintf('attachment; filename="%s"', $filename),
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformInvoice(Invoice $invoice, bool $includeItems = false): array
    {
        return (new InvoiceResource($invoice, $includeItems))->resolve(request());
    }

    /**
     * @return array<string, mixed>
     */
    private function buildInvoicePdfViewData(Invoice $invoice): array
    {
        return $this->pdfs->viewData($invoice);
    }
}
