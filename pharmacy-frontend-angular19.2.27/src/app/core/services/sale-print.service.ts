import { Injectable, inject } from "@angular/core";
import { MessageDialogService } from "../../shared/message-dialog/message-dialog.service";
import { Sale } from "../models/api.models";

/**
 * Builds and opens the printable Sale Invoice popup.
 *
 * Extracted from sale-form.component.ts so it can be reused wherever a sale
 * needs to be (re)printed — the Sale form's own checkout flow, the "Print"
 * button on each row of the Sales list, and the Sale detail/view page —
 * without duplicating the HTML template or having to re-derive amount/
 * discount/due figures in every place that wants to print a receipt.
 */
@Injectable({ providedIn: "root" })
export class SalePrintService {
  private readonly messageDialog = inject(MessageDialogService);

  /**
   * Opens a print-ready invoice for the given sale and triggers the browser
   * print dialog once it has loaded. A pre-opened window can be supplied by
   * the checkout Save click to avoid popup blockers during async requests.
   */
  print(sale: Sale, customerName?: string, targetWindow?: Window | null): void {
    const printWindow = targetWindow ?? window.open("", "_blank");
    if (!printWindow) {
      this.messageDialog.warning("Allow pop-ups to print the sale invoice.");
      return;
    }

    const resolvedCustomerName =
      customerName?.trim() || sale.customerName?.trim() || "Walk-in";

    const rows = (sale.items || [])
      .map((item) => {
        const total = item.quantity * item.unitPrice;
        const sub = [item.batchNumber ? `Batch: ${item.batchNumber}` : "", item.unitName || ""]
          .filter(Boolean)
          .join(" • ");
        return `<tr>
          <td><div class="item-name">${this.escape(item.productName || "")}</div>${sub ? `<div class="item-sub">${this.escape(sub)}</div>` : ""}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${item.unitPrice.toFixed(2)}</td>
          <td class="num">${total.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const subtotal = sale.totalAmount;
    const discount = (sale as any).discount ?? 0;
    const totalDue = (sale as any).netAmount ?? Math.max(subtotal - discount, 0);
    const amountPaid = sale.totalPaid ?? 0;
    const dueAmount = sale.dueAmount ?? Math.max(totalDue - amountPaid, 0);
    const change = Math.max(amountPaid - totalDue, 0);

    printWindow.document.write(`<!doctype html>
<html>
<head>
<title>Sale #${sale.saleId}</title>
<style>
  /* 80mm receipt-roll width, height auto-fits the content — no more
     printing a near-empty A4 sheet for a 2-line invoice. */
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 76mm;
    margin: 0 auto;
    padding: 3mm 3mm 6mm;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
  }
  h1 { font-size: 13px; margin: 0 0 2mm; text-align: center; letter-spacing: .3px; }
  .store-name { font-size: 15px; font-weight: 700; margin: 0 0 1mm; text-align: center; }
  .store-meta { font-size: 9px; margin: 0; text-align: center; }
  .meta { font-size: 10.5px; margin: 0 0 1mm; }
  .meta b { font-weight: 700; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { border-bottom: 1px dashed #000; padding: 1mm 0; text-align: left; font-size: 9.5px; }
  td { padding: 1mm 0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 600; }
  .item-sub { font-size: 8.5px; color: #555; }
  .totals { width: 100%; margin-top: 1mm; font-size: 10.5px; }
  .totals td { padding: .5mm 0; }
  .totals .val { text-align: right; }
  .grand td { border-top: 1px dashed #000; font-weight: 700; font-size: 11.5px; padding-top: 1mm; }
  .footer { margin-top: 3mm; text-align: center; font-size: 8.5px; color: #444; }
  @media print { body { width: 76mm; } }
</style>
</head>
<body>
  <div class="store-name">Get well Pharmacy</div>
  <p class="store-meta">Panthapath, dhaka - 1207</p>
  <p class="store-meta">Phone: 06777999888</p>
  <h1>Sale Invoice</h1>
  <p class="meta"><b>Sale #:</b> ${sale.saleId}</p>
  <p class="meta"><b>Date:</b> ${this.escape(sale.saleDate)}</p>
  <p class="meta"><b>Customer:</b> ${this.escape(resolvedCustomerName)}</p>
  ${sale.customerPhone ? `<p class="meta"><b>Customer phone:</b> ${this.escape(sale.customerPhone)}</p>` : ""}
  <p class="meta"><b>Sale by:</b> ${this.escape(sale.cashierName || "")}</p>
  <p class="meta"><b>Payment:</b> ${this.escape(sale.paymentMethod)} (${sale.isPaid ? "Paid" : "Due"})</p>
  <hr/>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr/>
  <table class="totals">
    <tr><td>Subtotal</td><td class="val">BDT ${subtotal.toFixed(2)}</td></tr>
    ${discount ? `<tr><td>Discount</td><td class="val">BDT ${discount.toFixed(2)}</td></tr>` : ""}
    <tr class="grand"><td>Net Total</td><td class="val">BDT ${totalDue.toFixed(2)}</td></tr>
    ${amountPaid ? `<tr><td>Paid</td><td class="val">BDT ${amountPaid.toFixed(2)}</td></tr>` : ""}
    ${dueAmount > 0
        ? `<tr><td>Due</td><td class="val">BDT ${dueAmount.toFixed(2)}</td></tr>`
        : change > 0
          ? `<tr><td>Change</td><td class="val">BDT ${change.toFixed(2)}</td></tr>`
          : ""
      }
  </table>
  ${sale.termsAndConditions ? `<p class="meta"><b>Terms and conditions:</b> ${this.escape(sale.termsAndConditions)}</p>` : ""}
  <div class="footer">Thank you</div>
  <script>window.onload=()=>window.print();<\/script>
</body>
</html>`);
    printWindow.document.close();
  }

  private escape(value: unknown): string {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }
}
