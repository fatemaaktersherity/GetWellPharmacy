import { Injectable, inject } from "@angular/core";
import { MessageDialogService } from "../../shared/message-dialog/message-dialog.service";
import {
  PurchaseOrder,
  PURCHASE_ORDER_SOURCES,
  PURCHASE_ORDER_STATUSES,
} from "../models/api.models";

/**
 * Builds and opens the printable Purchase Order popup.
 * Used right after save, and from the "Print" button on the
 * Purchase Order view page (in case the first printout is lost).
 */
@Injectable({ providedIn: "root" })
export class PurchaseOrderPrintService {
  private readonly messageDialog = inject(MessageDialogService);

  print(order: PurchaseOrder): void {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.messageDialog.warning("Allow pop-ups to print the purchase order.");
      return;
    }

    const rows = (order.items || [])
      .map((item) => {
        return `<tr${item.isCancelled ? ' style="opacity:.5;text-decoration:line-through"' : ""}>
          <td><div class="item-name">${this.escape(item.productName || "Product #" + item.productId)}</div>${item.unitName ? `<div class="item-sub">${this.escape(item.unitName)}</div>` : ""}</td>
          <td class="num">${(item.lastPurchasePrice ?? 0).toFixed(2)}</td>
          <td class="num">${item.stockQty}</td>
          <td class="num">${item.requiredQty}</td>
          <td class="num">${item.orderQty}</td>
        </tr>`;
      })
      .join("");

    const sourceLabel = PURCHASE_ORDER_SOURCES[order.source] ?? String(order.source);
    const statusLabel = PURCHASE_ORDER_STATUSES[order.status] ?? String(order.status);

    printWindow.document.write(`<!doctype html>
<html>
<head>
<title>PO #${order.orderNo}</title>
<style>
  /* 80mm receipt-roll width, height auto-fits the content — no more
     printing a near-empty A4 sheet for a short order. */
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
  .meta { font-size: 10.5px; margin: 0 0 1mm; }
  .meta b { font-weight: 700; }
  .urgent { color: #b71c1c; font-weight: 700; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { border-bottom: 1px dashed #000; padding: 1mm 0; text-align: left; font-size: 9.5px; }
  td { padding: 1mm 0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 600; }
  .item-sub { font-size: 8.5px; color: #555; }
  @media print { body { width: 76mm; } }
</style>
</head>
<body>
  <h1>Purchase Order</h1>
  <p class="meta"><b>Order #:</b> ${this.escape(order.orderNo)}</p>
  <p class="meta"><b>Order Date:</b> ${this.escape(order.orderDate)}</p>
  ${order.requirementDate ? `<p class="meta"><b>Required By:</b> ${this.escape(order.requirementDate)}</p>` : ""}
  <p class="meta"><b>Supplier:</b> ${this.escape(order.supplierName || "")}${order.supplierTypeName ? ` (${this.escape(order.supplierTypeName)})` : ""}</p>
  <p class="meta"><b>Source:</b> ${this.escape(sourceLabel)} &nbsp; <b>Status:</b> ${this.escape(statusLabel)}</p>
  ${order.isUrgent ? `<p class="meta urgent">URGENT</p>` : ""}
  <hr/>
  <table>
    <thead><tr><th>Item</th><th class="num">Last</th><th class="num">Stock</th><th class="num">Req</th><th class="num">Ord</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
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