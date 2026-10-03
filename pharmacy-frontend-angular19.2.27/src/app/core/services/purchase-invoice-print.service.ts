import { Injectable } from "@angular/core";
import { PurchaseInvoice } from "../models/api.models";

@Injectable({ providedIn: "root" })
export class PurchaseInvoicePrintService {
  print(invoice: PurchaseInvoice, purchaseOrderNo = ""): void {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const escape = (value: unknown) => {
      const element = document.createElement("div");
      element.textContent = String(value ?? "");
      return element.innerHTML;
    };
    const rows = (invoice.items ?? []).map(item => `<tr>
      <td>${escape(item.productName || `Product #${item.productId}`)}<small>${escape(item.unitName || "")}</small></td>
      <td class="num">${item.receivedQty}</td><td class="num">${Number(item.unitCost || 0).toFixed(2)}</td>
      <td class="num">${(Number(item.receivedQty || 0) * Number(item.unitCost || 0)).toFixed(2)}</td>
      <td>${escape(item.batchNumber || "-")}</td><td>${escape(item.expiryDate || "-")}</td>
    </tr>`).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Purchase ${escape(invoice.invoiceNo)}</title>
      <style>body{font:13px Arial,sans-serif;color:#222;margin:24px}h1{font-size:22px;margin:0 0 6px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0}.meta small{display:block;color:#666;margin-bottom:4px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 7px;border-bottom:1px solid #ddd}th{background:#f5f7f8}.num{text-align:right}small{display:block;color:#666}.totals{margin:18px 0 0 auto;width:280px}.totals div{display:flex;justify-content:space-between;padding:5px}.grand{font-weight:bold;border-top:1px solid #aaa}@media print{body{margin:12mm}}</style>
      </head><body><h1>Purchase #${escape(invoice.invoiceNo)}</h1><div>Invoice items and batch details.</div>
      <div class="meta"><div><small>Supplier</small><b>${escape(invoice.supplierName || invoice.supplierId)}</b></div>
      <div><small>Warehouse</small><b>${escape(invoice.warehouseName || "-")}</b></div>
      <div><small>Purchase Order</small><b>${escape(purchaseOrderNo || "-")}</b></div>
      <div><small>Date</small><b>${escape(invoice.purchaseDate)}</b></div><div><small>Payment</small><b>${escape(invoice.paymentMethods?.join(", ") || invoice.paymentMethod || "-")}</b></div>
      <div><small>Status</small><b>${escape(invoice.paymentStatus)}</b></div></div>
      <table><thead><tr><th>Product</th><th class="num">Received Qty</th><th class="num">Unit Cost</th><th class="num">Line Total</th><th>Batch No.</th><th>Expiry Date</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div><span>Discount</span><span>${Number(invoice.discount || 0).toFixed(2)}</span></div><div><span>Tax / Others</span><span>${Number(invoice.taxOrOthers || 0).toFixed(2)}</span></div><div class="grand"><span>Total</span><span>BDT ${Number(invoice.total || 0).toFixed(2)}</span></div><div><span>Advance</span><span>BDT ${Number(invoice.advance || 0).toFixed(2)}</span></div><div><span>Balance Due</span><span>BDT ${Number(invoice.due || 0).toFixed(2)}</span></div></div>
      <script>window.onload=()=>window.print();<\/script></body></html>`);
    printWindow.document.close();
  }
}
