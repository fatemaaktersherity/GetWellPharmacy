import { Injectable, inject } from "@angular/core";
import { MessageDialogService } from "../../shared/message-dialog/message-dialog.service";
import { SaleReturn } from "../models/api.models";

@Injectable({ providedIn: "root" })
export class SaleReturnPrintService {
  private readonly messageDialog = inject(MessageDialogService);

  print(ret: SaleReturn): void {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.messageDialog.warning("Allow pop-ups to print the sale return.");
      return;
    }

    const rows = (ret.items ?? []).map((item) => `<tr>
      <td>${this.escape(item.medicineName || `Product #${item.medicineId}`)}</td>
      <td>${this.escape(item.unitName || "-")}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${item.salesPrice.toFixed(2)}</td>
      <td class="num">${item.subTotal.toFixed(2)}</td>
    </tr>`).join("");
    const refundRows = (ret.refunds ?? []).map((refund) => `<tr>
      <td>${this.escape(new Date(refund.refundedAt).toLocaleString())}</td>
      <td>${this.escape(refund.paymentMethod)}</td>
      <td class="num">${refund.amount.toFixed(2)}</td>
      <td>${this.escape(refund.note || "-")}</td>
    </tr>`).join("");
    const receipt = ret.receiptImage
      ? `data:${ret.receiptImageContentType || "image/jpeg"};base64,${ret.receiptImage}`
      : ret.receiptImagePath;
    const receiptBlock = receipt
      ? `<h2>Receipt</h2><img class="receipt" src="${this.escape(receipt)}" alt="Sale return receipt">`
      : "";

    printWindow.document.write(`<!doctype html>
<html><head><title>Sale Return ${this.escape(ret.returnNo)}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172b2a; font-size: 12px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  h2 { margin: 22px 0 8px; font-size: 15px; }
  .muted { color: #667; margin: 0 0 18px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 18px 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 8px; border-bottom: 1px solid #d8dfdf; text-align: left; }
  th { background: #f2f7f6; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 280px; }
  .totals p { display: flex; justify-content: space-between; margin: 6px 0; }
  .receipt { display: block; max-width: 320px; max-height: 240px; object-fit: contain; }
</style></head><body>
  <h1>Sale Return ${this.escape(ret.returnNo)}</h1>
  <p class="muted">Sale #${ret.saleId} · ${this.escape(new Date(ret.returnDate).toLocaleDateString())}</p>
  <div class="meta">
    <div><b>Status:</b> ${ret.isDeleted ? "Deleted" : ret.customerCredit <= 0 ? "Credit settled" : ret.refundedAmount > 0 || ret.appliedToDue > 0 ? "Partially settled" : "Awaiting customer refund"}</div>
    <div><b>Reason:</b> ${this.escape(ret.reason || "-")}</div>
  </div>
  <table><thead><tr><th>Product</th><th>Unit</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
  ${refundRows ? `<h2>Refund History</h2><table><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>${refundRows}</tbody></table>` : ""}
  <div class="totals">
    <p><span>Return Total</span><b>${ret.returnTotal.toFixed(2)}</b></p>
    <p><span>Applied to outstanding due</span><b>${ret.appliedToDue.toFixed(2)}</b></p>
    <p><span>Refunded</span><b>${ret.refundedAmount.toFixed(2)}</b></p>
    <p><span>Remaining Customer Credit</span><b>${ret.customerCredit.toFixed(2)}</b></p>
  </div>
  ${receiptBlock}
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
