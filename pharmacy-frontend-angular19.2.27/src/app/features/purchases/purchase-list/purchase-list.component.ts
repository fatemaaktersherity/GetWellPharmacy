import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from "@angular/core";
import { forkJoin } from "rxjs";
import { CurrencyPipe, DatePipe, SlicePipe } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { Router, RouterLink } from "@angular/router";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ApiService } from "../../../core/services/api.service";
import {
  PurchaseInvoice,
  PurchaseOrder,
  Supplier,
} from "../../../core/models/api.models";
import { PaginationComponent } from "../../../shared/pagination/pagination.component";
import { PurchaseInvoicePrintService } from "../../../core/services/purchase-invoice-print.service";

interface PurchaseInvoiceRow extends PurchaseInvoice {
  supplierTypeName?: string;
  purchaseOrderNo?: string;
  // Totals across the invoice's items. orderedQty is null when the invoice
  // has no purchase order (older direct purchases).
  orderedQty: number | null;
  receivedQty: number;
}

@Component({
  selector: "app-purchase-list",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    SlicePipe,
    PaginationComponent,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink,
    MatSnackBarModule,
  ],
  templateUrl: "./purchase-list.component.html",
  styleUrl: "./purchase-list.component.scss",
})
export class PurchaseListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly invoicePrint = inject(PurchaseInvoicePrintService);
  purchases: PurchaseInvoiceRow[] = [];
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly displayedColumns = [
    "invoiceNo",
    "purchaseOrder",
    "supplier",
    "supplierType",
    "date",
    "orderedQty",
    "receivedQty",
    "receivingStatus",
    "total",
    "paymentMethod",
    "advance",
    "due",
    "status",
    "receipt",
    "actions",
  ];

  private supplierMap = new Map<number, Supplier>();
  private orderMap = new Map<number, PurchaseOrder>();

  get filteredPurchases(): PurchaseInvoiceRow[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.purchases;
    return this.purchases.filter((purchase) =>
      [
        purchase.invoiceNo,
        purchase.purchaseOrderNo,
        purchase.supplierName || purchase.supplierId,
        purchase.supplierTypeName,
        purchase.purchaseDate,
        purchase.total,
        purchase.advance,
        purchase.due,
        purchase.paymentStatus,
        purchase.receivingStatus,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }

  ngOnInit(): void {
    // Suppliers (for the type fallback) and purchase orders (for PO no and
    // ordered qty) are loaded first so each invoice row can be enriched on
    // arrival — that data lives on those records, not on the invoice.
    forkJoin({
      suppliers: this.api.getSuppliers(),
      orders: this.api.getPurchaseOrders(),
    }).subscribe({
      next: ({ suppliers, orders }) => {
        this.supplierMap = new Map(suppliers.map((s) => [s.supplierId, s]));
        this.orderMap = new Map(orders.map((o) => [o.id, o]));
        this.load();
      },
      error: () => this.load(), // still show invoices without the extras
    });
  }

  load(): void {
    this.api.getPurchaseInvoices().subscribe({
      next: (purchases) =>
      (this.purchases = purchases
        .map((p) => {
          const supplier = this.supplierMap.get(p.supplierId);
          const order = p.purchaseOrderId
            ? this.orderMap.get(p.purchaseOrderId)
            : undefined;
          return {
            ...p,
            supplierTypeName:
              order?.supplierTypeName ?? supplier?.supplierTypeName,
            purchaseOrderNo: order?.orderNo,
            // orderedQty now comes straight from each item's stored
            // OrderedQty snapshot (see PurchaseInvoiceItem.orderedQty) —
            // computed once, server-side, when the line was recorded. This
            // replaces the earlier client-side reconstruction that matched
            // invoice items against the live purchase order on every read,
            // which broke as soon as one order was delivered across several
            // partial invoices (every invoice row showed the full order
            // total). null when the invoice has no purchase order at all.
            orderedQty: p.purchaseOrderId
              ? p.items.reduce((sum, i) => sum + (+(i.orderedQty ?? 0)), 0)
              : null,
            receivedQty: p.items.reduce(
              (sum, i) => sum + (+i.receivedQty || 0),
              0,
            ),
          };
        })
        .sort(
          (a, b) =>
            new Date(b.purchaseDate).getTime() -
            new Date(a.purchaseDate).getTime() || b.id - a.id,
        )),
      error: () =>
        this.snackbar.open("Could not load purchases.", "Close", {
          duration: 5000,
        }),
    });
  }
  view(id: number): void {
    this.router.navigate(["/purchases", id]);
  }
  print(purchase: PurchaseInvoiceRow): void {
    this.invoicePrint.print(purchase, purchase.purchaseOrderNo || "");
  }
  payDue(id: number): void {
    this.router.navigate(["/purchases", id, "payment"]);
  }
 editPurchase(id: number): void {
  this.router.navigate(["/purchases", id, "edit"]);
}
  async delete(id: number) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: "Delete this purchase? Stock will be adjusted.", confirmText: 'Continue', danger: true })) return;
    this.api.deletePurchaseInvoice(id).subscribe({
      next: () => {
        this.snackbar.open("Purchase deleted", "Close", { duration: 3000 });
        this.load();
      },
      error: (e) =>
        this.snackbar.open(
          e.error?.message || "Could not delete purchase.",
          "Close",
          { duration: 6000 },
        ),
    });
  }
  receiptUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }
}
