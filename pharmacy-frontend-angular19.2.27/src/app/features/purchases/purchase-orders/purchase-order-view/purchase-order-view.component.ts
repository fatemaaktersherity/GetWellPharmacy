import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { PurchaseOrderPrintService } from "../../../../core/services/purchase-order-print.service";
import { ApiService } from "../../../../core/services/api.service";
import {
    PurchaseOrder,
    PURCHASE_ORDER_SOURCES,
    PURCHASE_ORDER_STATUSES,
} from "../../../../core/models/api.models";

@Component({
    selector: "app-purchase-order-view",
    standalone: true,
    imports: [
        CurrencyPipe,
        DatePipe,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
    ],
    template: `<div class="page-header">
      <div>
        <h1>Purchase Order #{{ order?.orderNo }}</h1>
        <p>Order items and status detail.</p>
      </div>
      <div class="header-actions">
        @if (order) {
          <button mat-stroked-button (click)="printOrder()">
            <mat-icon>print</mat-icon> Print
          </button>
          <a
            mat-stroked-button
            [routerLink]="['/purchase-orders/edit', order.id]"
            ><mat-icon>edit</mat-icon> Edit</a
          >
        }
        <a mat-stroked-button routerLink="/purchase-orders"
          ><mat-icon>arrow_back</mat-icon> Back</a
        >
      </div>
    </div>
    @if (order) {
      <mat-card
        ><mat-card-content
          ><div class="summary">
            <div>
              <small>Supplier</small
              ><b>{{ order.supplierName || order.supplierId }}</b>
            </div>
            <div>
              <small>Supplier Type</small><b>{{ order.supplierTypeName || "-" }}</b>
            </div>
            <div>
              <small>Order Date</small
              ><b>{{ order.orderDate | date: "mediumDate" }}</b>
            </div>
            <div>
              <small>Required By</small
              ><b>{{
                order.requirementDate
                  ? (order.requirementDate | date: "mediumDate")
                  : "-"
              }}</b>
            </div>
            <div>
              <small>Source</small
              ><b>{{ sourceLabel(order.source) }}</b>
            </div>
            <div>
              <small>Status</small
              ><b
                ><span class="badge" [class]="'status-' + order.status">{{
                  statusLabel(order.status)
                }}</span></b
              >
            </div>
            <div>
              <small>Urgent</small
              ><b>{{ order.isUrgent ? "Yes" : "No" }}</b>
            </div>
            <div>
              <small>Created</small
              ><b>{{ order.createdAt | date: "medium" }}</b>
            </div>
          </div>
          @if (receiptUrl) {
            <p class="receipt-link">
              <a [href]="receiptUrl" target="_blank"
                ><mat-icon inline>image</mat-icon> View receipt / reference
                image</a
              >
            </p>
          }
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Last Purchase Price</th>
                <th>Current Stock Qty</th>
                <th>Required Qty</th>
                <th>Order Qty</th>
                <th>Cancelled</th>
              </tr>
            </thead>
            <tbody>
              @for (item of order.items; track item.id) {
                <tr [class.cancelled-row]="item.isCancelled">
                  <td>
                    {{ item.productName || "Product #" + item.productId }}
                  </td>
                  <td>{{ item.unitName || "Unit" }}</td>
                  <td>{{ item.lastPurchasePrice | currency: "BDT " }}</td>
                  <td>{{ item.stockQty }}</td>
                  <td>{{ item.requiredQty }}</td>
                  <td>{{ item.orderQty }}</td>
                  <td>
                    @if (item.isCancelled) {
                      <mat-icon color="warn" title="Cancelled">block</mat-icon>
                    } @else {
                      -
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </mat-card-content></mat-card
      >
    }`,
    styles: [
        `
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .header-actions {
        display: flex;
        gap: 8px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
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
      .cancelled-row {
        opacity: 0.55;
        text-decoration: line-through;
      }
      .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.85rem;
        background: #eceff1;
        color: #37474f;
      }
      .status-0 {
        background: #eceff1;
        color: #37474f;
      }
      .status-1 {
        background: #fff8e1;
        color: #8d6e00;
      }
      .status-2 {
        background: #e3f2fd;
        color: #0d47a1;
      }
      .status-3 {
        background: #e8f5e9;
        color: #1b5e20;
      }
      .status-4 {
        background: #ffebee;
        color: #b71c1c;
      }
      @media (max-width: 700px) {
        .summary {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
    ],
})
export class PurchaseOrderViewComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly poPrint = inject(PurchaseOrderPrintService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    order?: PurchaseOrder;
    receiptUrl: string | null = null;

    printOrder(): void {
        if (this.order) this.poPrint.print(this.order);
    }

    statusLabel(s: number): string {
        return PURCHASE_ORDER_STATUSES[s] ?? String(s);
    }
    sourceLabel(s: number): string {
        return PURCHASE_ORDER_SOURCES[s] ?? String(s);
    }

    ngOnInit(): void {
        this.api
            .getPurchaseOrder(Number(this.route.snapshot.paramMap.get("id")))
            .subscribe({
                next: (o) => {
                    this.order = o;
                    this.receiptUrl = this.api.assetUrl(o.receiptImagePath);
                },
                error: () => this.router.navigate(["/purchase-orders"]),
            });
    }
}
