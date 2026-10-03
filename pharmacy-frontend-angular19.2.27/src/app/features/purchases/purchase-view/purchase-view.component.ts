import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { ApiService } from "../../../core/services/api.service";
import { PurchaseInvoice } from "../../../core/models/api.models";
import { PurchaseInvoicePrintService } from "../../../core/services/purchase-invoice-print.service";

@Component({
  selector: "app-purchase-view",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatCheckboxModule,
  ],
  template: `<div class="page-header">
      <div>
        <h1>Purchase #{{ invoice?.invoiceNo }}</h1>
        <p>Invoice items and batch details.</p>
      </div>
      <div class="header-actions">
        <a mat-stroked-button routerLink="/purchases"><mat-icon>arrow_back</mat-icon> Back</a>
        @if (invoice) {
          <button mat-stroked-button type="button" (click)="printInvoice()"><mat-icon>print</mat-icon> Print</button>
        }
      </div>
    </div>
    @if (invoice) {
      <mat-card
        ><mat-card-content
          ><div class="summary">
            <div>
              <small>Supplier</small
              ><b>{{ invoice.supplierName || invoice.supplierId || "-" }}</b>
            </div>
            @if (invoice.companyName) {
              <div>
                <small>Company</small><b>{{ invoice.companyName }}</b>
              </div>
            }
            <div>
              <small>Warehouse</small
              ><b>{{ invoice.warehouseName || "-" }}</b>
            </div>
            @if (purchaseOrderNo) {
              <div>
                <small>Purchase Order</small><b>{{ purchaseOrderNo }}</b>
              </div>
            }
            <div>
              <small>Date</small
              ><b>{{ invoice.purchaseDate | date: "mediumDate" }}</b>
            </div>
            <div>
              <small>Payment</small><b>{{ invoice.paymentMethods?.join(", ") || invoice.paymentMethod }}</b>
            </div>
            <div>
              <small>Payment Status</small>
              <mat-checkbox [checked]="invoice.isPaymentComplete" disabled>
                {{ invoice.isPaymentComplete ? "Complete" : "Incomplete" }}
              </mat-checkbox>
              @if (invoice.due > 0) {
                <b>({{ invoice.due | currency: "BDT " }})</b>
              }
            </div>
            <div>
              <small>Receiving Status</small><b>{{ invoice.receivingStatus }}</b>
            </div>
          </div>

          @if (receiptUrl) {
            <p class="receipt-link">
              <a [href]="receiptUrl" target="_blank"
                ><mat-icon inline>image</mat-icon> View invoice / receipt
                image</a
              >
            </p>
          }

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Ordered Qty</th>
                <th>Received Qty</th>
                <th>Unit Cost</th>
                <th>Line Total</th>
                <th>Batch No.</th>
                <th>Manufacturing Date</th>
                <th>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              @for (item of invoice.items; track item.id) {
                <tr>
                  <td>
                    {{ item.productName || "Product #" + item.productId }}
                  </td>
                  <td>{{ item.unitName || "Unit" }}</td>
                  <td>{{ item.orderedQty ?? "-" }}</td>
                  <td>
                    <span [class.short]="isShort(item)">{{ item.receivedQty }}</span>
                  </td>
                  <td>{{ item.unitCost | currency: "BDT " }}</td>
                  <td>{{ item.receivedQty * item.unitCost | currency: "BDT " }}</td>
                  <td>{{ item.batchNumber || "-" }}</td>
                  <td>
                    {{
                      item.manufacturingDate
                        ? (item.manufacturingDate | date: "mediumDate")
                        : "-"
                    }}
                  </td>
                  <td>
                    {{
                      item.expiryDate
                        ? (item.expiryDate | date: "mediumDate")
                        : "-"
                    }}
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>Subtotal</span>
              <span>{{ subtotal() | currency: "BDT " }}</span>
            </div>
            <div class="totals-row">
              <span>Discount</span>
              <span>{{
                invoice.discount
                  ? "-" + (invoice.discount | currency: "BDT ")
                  : "-"
              }}</span>
            </div>
            <div class="totals-row">
              <span>Tax / Others</span>
              <span>{{
                invoice.taxOrOthers
                  ? "+" + (invoice.taxOrOthers | currency: "BDT ")
                  : "-"
              }}</span>
            </div>
            <div class="totals-row grand">
              <span>Total</span>
              <span>{{ invoice.total | currency: "BDT " }}</span>
            </div>
            <div class="totals-row">
              <span>Advance</span>
              <span>{{ invoice.advance || 0 | currency: "BDT " }}</span>
            </div>
            <div class="totals-row due">
              <span>Balance Due</span>
              <span>{{ invoice.due || 0 | currency: "BDT " }}</span>
            </div>
          </div></mat-card-content
        ></mat-card
      >
    }`,
  styles: [
    `
      .short {
        color: #e65100;
        font-weight: 500;
      }
      .header-actions { display: flex; gap: 8px; }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        margin-bottom: 20px;
      }
      .summary small,
      .summary b {
        display: block;
      }
      .summary small {
        color: #677;
      }
      .summary b {
        margin-top: 4px;
      }
      .receipt-link {
        margin: 0 0 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 11px;
        border-bottom: 1px solid #eee;
        text-align: left;
      }
      .totals {
        margin: 20px 0 0 auto;
        max-width: 340px;
      }
      .totals-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
      }
      .totals-row.grand {
        border-top: 1px solid #ddd;
        margin-top: 4px;
        padding-top: 10px;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .totals-row.due {
        color: #c62828;
        font-weight: 600;
      }
      @media (max-width: 700px) {
        .summary {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
})
export class PurchaseViewComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoicePrint = inject(PurchaseInvoicePrintService);
  invoice?: PurchaseInvoice;
  purchaseOrderNo = "";
  receiptUrl: string | null = null;

  printInvoice(): void {
    if (this.invoice) this.invoicePrint.print(this.invoice, this.purchaseOrderNo);
  }

  ngOnInit(): void {
    this.api
      .getPurchaseInvoice(Number(this.route.snapshot.paramMap.get("id")))
      .subscribe({
        next: (i) => {
          this.invoice = i;
          this.receiptUrl = this.api.assetUrl(i.receiptImagePath);
          // Ordered Qty per line comes straight from item.orderedQty (a
          // backend snapshot — see PurchaseInvoiceItem.orderedQty); this
          // fetch is only to display the order's human-readable number.
          if (i.purchaseOrderId) this.loadOrderNo(i.purchaseOrderId);
        },
        error: () => this.router.navigate(["/purchases"]),
      });
  }

  private loadOrderNo(purchaseOrderId: number): void {
    this.api.getPurchaseOrder(purchaseOrderId).subscribe({
      next: (po) => (this.purchaseOrderNo = po.orderNo),
      error: () => {}, // extra info only
    });
  }

  // Sum of (receivedQty × unitCost) — same as the backend's item SubTotal.
  subtotal(): number {
    return (this.invoice?.items ?? []).reduce(
      (sum, i) => sum + i.receivedQty * i.unitCost,
      0,
    );
  }

  isShort(item: { orderedQty?: number; receivedQty: number }): boolean {
    return item.orderedQty != null && item.receivedQty < item.orderedQty;
  }
}
