import { Injectable, inject } from "@angular/core";
import { MessageDialogService } from "../../shared/message-dialog/message-dialog.service";

/**
 * Prints any report table (Sales, Purchases, Stock valuation, etc.) as an
 * A4-landscape popup — same open-window / escape / auto-print pattern as
 * SalePrintService and PurchaseOrderPrintService, just sized for a table
 * of rows instead of an 80mm receipt.
 */
@Injectable({ providedIn: "root" })
export class ReportPrintService {
    private readonly messageDialog = inject(MessageDialogService);

    print(
        title: string,
        subtitle: string,
        columns: string[],
        formatHeader: (key: string) => string,
        formatValue: (value: any) => string,
        rows: any[],
    ): void {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            this.messageDialog.warning("Allow pop-ups to print the report.");
            return;
        }

        const headerCells = columns.map((c) => `<th>${this.escape(formatHeader(c))}</th>`).join("");
        const bodyRows = rows
            .map(
                (row) =>
                    `<tr>${columns.map((c) => `<td>${this.escape(formatValue(row[c]))}</td>`).join("")}</tr>`,
            )
            .join("");

        printWindow.document.write(`<!doctype html>
<html>
<head>
<title>${this.escape(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
  h1 { font-size: 16px; margin: 0 0 2mm; }
  .subtitle { font-size: 11px; color: #444; margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 2mm 3mm; text-align: left; }
  th { background: #f0f0f0; font-weight: 700; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 4mm; font-size: 9px; color: #666; }
</style>
</head>
<body>
  <h1>${this.escape(title)}</h1>
  ${subtitle ? `<p class="subtitle">${this.escape(subtitle)}</p>` : ""}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">Printed on ${this.escape(new Date().toLocaleString())} • ${rows.length} row${rows.length === 1 ? "" : "s"}</div>
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