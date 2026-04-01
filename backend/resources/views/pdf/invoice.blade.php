<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 0;
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            color: #111827;
        }
        .page {
            padding: 20px 24px;
        }
        .header {
            background: #1f3c66;
            color: #ffffff;
            padding: 14px 16px;
            border-radius: 4px;
            margin-bottom: 14px;
        }
        .title {
            font-size: 26px;
            line-height: 1.1;
            font-weight: 700;
            margin: 0 0 4px;
        }
        .invoice-number {
            font-size: 13px;
            margin: 0;
        }
        .grid {
            width: 100%;
            margin-bottom: 16px;
        }
        .grid td {
            width: 50%;
            vertical-align: top;
            padding: 0 8px 0 0;
        }
        .grid td:last-child {
            padding-right: 0;
            padding-left: 8px;
        }
        .card {
            border: 1px solid #d1d5db;
            border-radius: 4px;
            padding: 12px;
            min-height: 90px;
        }
        .label {
            color: #334155;
            font-weight: 700;
            margin: 0 0 6px;
            font-size: 11px;
        }
        .value-main {
            margin: 0 0 4px;
            font-weight: 700;
            font-size: 14px;
            line-height: 1.2;
        }
        .value-sub {
            margin: 0;
            color: #334155;
            font-size: 11px;
        }
        .section-title {
            margin: 16px 0 8px;
            font-size: 17px;
            font-weight: 700;
        }
        .summary {
            width: 100%;
            margin-bottom: 10px;
            border-collapse: collapse;
        }
        .summary td {
            width: 50%;
            padding: 2px 0;
            font-size: 11px;
            vertical-align: top;
        }
        .summary td:last-child {
            text-align: right;
            font-weight: 700;
        }
        .line {
            border-top: 1px solid #e2e8f0;
            margin: 8px 0 10px;
        }
        table.items,
        table.payments {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-bottom: 10px;
        }
        table.items th,
        table.payments th {
            text-align: left;
            background: #e2e8f0;
            color: #1f2937;
            font-size: 11px;
            padding: 8px 10px;
            border: 1px solid #d1d5db;
        }
        table.items td,
        table.payments td {
            padding: 8px 10px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
            font-size: 11px;
            word-wrap: break-word;
        }
        .num {
            text-align: right;
        }
        .totals-wrap {
            width: 100%;
            margin-top: 6px;
            margin-bottom: 14px;
        }
        .totals-box {
            width: 280px;
            margin-left: auto;
            border: 1px solid #d1d5db;
            border-radius: 4px;
        }
        .totals-box table {
            width: 100%;
            border-collapse: collapse;
        }
        .totals-box td {
            padding: 8px 10px;
            border-top: 1px solid #e2e8f0;
            font-size: 11px;
        }
        .totals-box tr:first-child td {
            border-top: none;
        }
        .totals-box td:last-child {
            text-align: right;
            font-weight: 700;
        }
        .totals-balance td:last-child {
            color: #b91c1c;
        }
        .muted {
            color: #64748b;
            font-size: 10px;
        }
        .footer {
            margin-top: 16px;
            color: #64748b;
            font-size: 9px;
            text-align: right;
        }
    </style>
</head>
<body>
<div class="page">
    <div class="header">
        <p class="title">{{ $title }}</p>
        <p class="invoice-number">{{ $invoice_number_line }}</p>
    </div>

    <table class="grid">
        <tr>
            <td>
                <div class="card">
                    <p class="label">{{ $provider_label }}</p>
                    <p class="value-main">{{ $provider_name }}</p>
                    @if($provider_contact !== '')
                        <p class="value-sub">{{ $provider_contact }}</p>
                    @endif
                </div>
            </td>
            <td>
                <div class="card">
                    <p class="label">{{ $patient_label }}</p>
                    <p class="value-main">{{ $patient_name }}</p>
                    <p class="value-sub">{{ $patient_line }}</p>
                </div>
            </td>
        </tr>
    </table>

    <p class="section-title">{{ $summary_label }}</p>
    <div class="line"></div>
    <table class="summary">
        <tr>
            <td>{{ $invoice_date_label }}</td>
            <td>{{ $status_label }}</td>
        </tr>
    </table>

    <p class="section-title">{{ $items_label }}</p>
    <table class="items">
        <thead>
        <tr>
            <th style="width: 48%;">{{ $headers['description'] }}</th>
            <th style="width: 12%;">{{ $headers['qty'] }}</th>
            <th style="width: 20%;">{{ $headers['unit'] }}</th>
            <th style="width: 20%;">{{ $headers['total'] }}</th>
        </tr>
        </thead>
        <tbody>
        @foreach($items as $item)
            <tr>
                <td>{{ $item['description'] }}</td>
                <td class="num">{{ $item['quantity'] }}</td>
                <td class="num">{{ $item['unit_price'] }}</td>
                <td class="num">{{ $item['total_price'] }}</td>
            </tr>
        @endforeach
        </tbody>
    </table>

    <div class="totals-wrap">
        <div class="totals-box">
            <table>
                <tr>
                    <td>{{ $headers['total'] }}</td>
                    <td>{{ $totals['total'] }}</td>
                </tr>
                <tr>
                    <td>{{ $headers['paid'] }}</td>
                    <td>{{ $totals['paid'] }}</td>
                </tr>
                <tr class="totals-balance">
                    <td>{{ $headers['balance'] }}</td>
                    <td>{{ $totals['balance'] }}</td>
                </tr>
            </table>
        </div>
    </div>

    <p class="section-title">{{ $payment_history_label }}</p>
    @if(count($payments) > 0)
        <table class="payments">
            <thead>
            <tr>
                <th style="width: 30%;">{{ $headers['date'] }}</th>
                <th style="width: 45%;">{{ $headers['method'] }}</th>
                <th style="width: 25%;">{{ $headers['amount'] }}</th>
            </tr>
            </thead>
            <tbody>
            @foreach($payments as $payment)
                <tr>
                    <td>{{ $payment['date'] }}</td>
                    <td>{{ $payment['method'] }}</td>
                    <td class="num">{{ $payment['amount'] }}</td>
                </tr>
            @endforeach
            </tbody>
        </table>
    @else
        <p class="muted">{{ $no_payments_text }}</p>
    @endif

    <p class="footer">{{ $generated_by_label }} | {{ $generated_at }}</p>
</div>
</body>
</html>
