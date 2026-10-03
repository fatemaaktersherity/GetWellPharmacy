import { ConfirmDialogService } from '../../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from "@angular/core";
import { CommonModule, DatePipe, SlicePipe } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { RouterLink } from "@angular/router";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import {
  PurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_SOURCES,
} from "../../../../core/models/api.models";
import { ApiService } from "../../../../core/services/api.service";
import { PaginationComponent } from "../../../../shared/pagination/pagination.component";

@Component({
  selector: "app-purchase-order-list",
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    SlicePipe,
    PaginationComponent,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    RouterLink,
    MatSnackBarModule,
  ],
  templateUrl: "./purchase-order-list.component.html",
  styleUrl: "./purchase-order-list.component.scss",
})
export class PurchaseOrderListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);

  orders: PurchaseOrder[] = [];
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly cols = [
    "orderNo",
    "supplier",
    "orderDate",
    "requirementDate",
    "source",
    "status",
    "urgent",
     "receipt",
    "actions",
  ];

  statusLabel(s: number): string {
    return PURCHASE_ORDER_STATUSES[s] ?? String(s);
  }

  receiptUrl(path?: string): string | null {
  return this.api.assetUrl(path);
}

  sourceLabel(s: number): string {
    return PURCHASE_ORDER_SOURCES[s] ?? String(s);
  }

  get filteredOrders(): PurchaseOrder[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.orders;
    return this.orders.filter((o) =>
      [
        o.orderNo,
        o.supplierName || o.supplierId,
        o.supplierTypeName,
        this.statusLabel(o.status),
        this.sourceLabel(o.source),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.getPurchaseOrders().subscribe({
      next: (orders) =>
        (this.orders = [...orders].sort(
          (a, b) =>
            new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime() ||
            b.id - a.id,
        )),
      error: () =>
        this.snackbar.open("Could not load purchase orders.", "Close", {
          duration: 5000,
        }),
    });
  }

  async delete(id: number) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: "Delete this purchase order?", confirmText: 'Continue', danger: true })) return;
    this.api.deletePurchaseOrder(id).subscribe({
      next: () => {
        this.snackbar.open("Purchase order deleted", "Close", {
          duration: 3000,
        });
        this.load();
      },
      error: (e) =>
        this.snackbar.open(
          e.error?.message ||
            "Could not delete purchase order. It may already be converted to an invoice.",
          "Close",
          { duration: 6000 },
        ),
    });
  }
}
