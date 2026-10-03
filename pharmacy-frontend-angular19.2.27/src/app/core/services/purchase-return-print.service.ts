import { Injectable, inject } from "@angular/core";
import { MessageDialogService } from "../../shared/message-dialog/message-dialog.service";
import { PurchaseReturn } from "../models/api.models";

@Injectable({ providedIn: "root" })
export class PurchaseReturnPrintService {
  private readonly messageDialog = inject(MessageDialogService);

  print(ret: PurchaseReturn): void {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.messageDialog.warning("Allow pop-ups to print the purchase return.");
      return;
    }

    const rows = (ret.items ?? [])
      .map(
        (item) => `<tr>
          <td>${this.escape(item.productName || `Product #${item.productId}`)}</td>
          <td>${this.escape(item.unitName || "-")}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${item.unitCost.toFixed(2)}</td>
          <td class="num">${item.subTotal.toFixed(2)}</td>
        </tr>`,
      )
      .join("");
    const received = (ret.receives ?? []).reduce(
      (sum, receive) => sum + (receive.paymentMethod === "Supplier Credit" ? 0 : receive.receivedAmount),
      0,
    );
    const supplierCredit = (ret.receives ?? []).reduce(
      (sum, receive) => sum + (receive.paymentMethod === "Supplier Credit" ? receive.receivedAmount : 0),
      0,
    );
    const receiveRows = (ret.receives ?? [])
      .map(
        (receive) => `<tr>
          <td>${this.escape(new Date(receive.receivedDate).toLocaleDateString())}</td>
          <td>${this.escape(receive.paymentMethod === "Supplier Credit" ? "Supplier credit (no cash)" : `${receive.paymentMethod} refund`)}</td>
          <td class="num">${receive.receivedAmount.toFixed(2)}</td>
          <td>${this.escape(receive.note || "-")}</td>
        </tr>`,
      )
      .join("");

    printWindow.document.write(`<!doctype html>
<html><head><title>Purchase Return ${this.escape(ret.returnNo)}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172b2a; font-size: 12px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .muted { color: #667; margin: 0 0 18px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 18px 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 8px; border-bottom: 1px solid #d8dfdf; text-align: left; }
  th { background: #f2f7f6; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 260px; }
  .totals p { display: flex; justify-content: space-between; margin: 6px 0; }
</style></head><body>
  <h1>Purchase Return ${this.escape(ret.returnNo)}</h1>
  <p class="muted">Purchase Invoice #${ret.purchaseInvoiceId} · ${this.escape(new Date(ret.returnDate).toLocaleDateString())}</p>
  <div class="meta">
    <div><b>Status:</b> ${ret.isCompleted ? "Fully credited" : "Awaiting supplier credit"}</div>
    <div><b>Reason:</b> ${this.escape(ret.reason || "-")}</div>
  </div>
  <table><thead><tr><th>Product</th><th>Unit</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Subtotal</th></tr></thead>
  <tbody>${rows}</tbody></table>
  ${receiveRows ? `<h2>Refunds &amp; Credits</h2><table><thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>${receiveRows}</tbody></table>` : ""}
  <div class="totals">
    <p><span>Return Total</span><b>${ret.returnTotal.toFixed(2)}</b></p>
    <p><span>Cash Refunded</span><b>${received.toFixed(2)}</b></p>
    <p><span>Supplier Credit Confirmed</span><b>${supplierCredit.toFixed(2)}</b></p>
    <p><span>Remaining Credit</span><b>${Math.max(0, ret.returnTotal - received - supplierCredit).toFixed(2)}</b></p>
  </div>
  <script>window.onload=()=>window.print();<\/script>
</body></html>`);
    printWindow.document.close();
  }

  private escape(value: unknown): string {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }
}
