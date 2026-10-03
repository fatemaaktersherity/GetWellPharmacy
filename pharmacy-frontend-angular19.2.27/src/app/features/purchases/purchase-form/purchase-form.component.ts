import { Component, inject, OnInit } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import {
  ReactiveFormsModule,
  FormArray,
  FormBuilder,
  Validators,
} from "@angular/forms";
import { Observable } from "rxjs";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { ApiService } from "../../../core/services/api.service";
import { PURCHASE_ORDER_STATUSES } from "../../../core/models/api.models";
import { PaymentMethodService } from "../../payment-methods/payment-method.service";
import { AuthService } from "../../../core/services/auth.service";

@Component({
  selector: "app-purchase-form",
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    MatCheckboxModule,
  ],
  templateUrl: "./purchase-form.component.html",
  styleUrl: "./purchase-form.component.scss",
})
export class PurchaseFormComponent implements OnInit {
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private paymentMethodService = inject(PaymentMethodService);

  warehouses: any[] = [];
  purchaseOrders: any[] = [];
  isAdmin = this.auth.isAdmin();
  editMoneyFields = false;

  // Supplier / company / supplier type are chosen on the Purchase Order only.
  // This page just carries the supplier id through (hidden) and the name for
  // the print-out — there is no supplier or company UI here.
  purchaseOrderNo = "";
  supplierName = "";

  availablePaymentMethods: string[] = [];
  paymentMethodsLocked = false;

  id?: number;
  saving = false;
  receiptFile?: File;
  receiptPreview?: string;

  form = this.fb.group({
    invoiceNo: [""],
    purchaseDate: [new Date().toISOString().slice(0, 10), Validators.required],
    supplierId: [null as number | null],
    purchaseOrderId: [null as number | null],
    warehouseId: [null as number | null, Validators.required],
    advance: [0, Validators.min(0)],
    discount: [0, Validators.min(0)],
    taxOrOthers: [0, Validators.min(0)],
    paymentMethod: ["Cash", Validators.required],
    receivingStatus: ["Completed" as "Completed" | "Partially Received", Validators.required],
    items: this.fb.array([]),
  });

  get items(): FormArray<any> {
    return this.form.controls.items as FormArray<any>;
  }

  // ── Admin "full edit" lock ────────────────────────────────────────────────
  setMoneyFieldsLocked(locked: boolean): void {
    const action = locked ? "disable" : "enable";
    this.form.controls.discount[action]();
    this.form.controls.taxOrOthers[action]();
    this.form.controls.advance[action]();
    this.paymentMethodsLocked = locked;

    for (const group of this.items.controls) {
      group.get("receivedQty")?.[action]();
      group.get("unitCost")?.[action]();
    }
  }

  toggleMoneyEditing(enabled: boolean): void {
    this.editMoneyFields = enabled;
    this.setMoneyFieldsLocked(!enabled);
  }

  ngOnInit(): void {
    this.api.getWarehouses().subscribe((x) => (this.warehouses = x));
    this.paymentMethodService
      .getAll()
      .subscribe(
        (methods) => {
          this.availablePaymentMethods = methods.filter((m) => m.isActive).map((m) => m.name);
          if (!this.availablePaymentMethods.includes(this.form.controls.paymentMethod.value ?? "") && this.availablePaymentMethods.length) {
            this.form.controls.paymentMethod.setValue(this.availablePaymentMethods[0]);
          }
        },
      );

    const id = this.route.snapshot.paramMap.get("id");
    if (id) {
      this.id = +id;
      this.api.getPurchaseInvoice(this.id).subscribe((p) => {
        this.form.patchValue({
          invoiceNo: p.invoiceNo,
          purchaseDate: p.purchaseDate ? p.purchaseDate.slice(0, 10) : null,
          supplierId: p.supplierId ?? null,
          purchaseOrderId: p.purchaseOrderId ?? null,
          warehouseId: p.warehouseId,
          advance: p.advance,
          discount: p.discount ?? 0,
          taxOrOthers: p.taxOrOthers ?? 0,
          paymentMethod: (p.paymentMethod || "Cash").split(",")[0].trim(),
          receivingStatus: p.receivingStatus ?? "Completed",
        });
        this.supplierName = p.supplierName ?? "";
        this.receiptPreview = p.receiptImagePath
          ? (this.api.assetUrl(p.receiptImagePath) ?? undefined)
          : undefined;

        p.items.forEach((i) => this.addItem(i));
        this.setMoneyFieldsLocked(true);

        // Order Qty isn't stored on the invoice line — pull it from the
        // purchase order this invoice was raised against.
        if (p.purchaseOrderId) this.loadOrderQtyForExistingInvoice(p.purchaseOrderId);
      });
    } else {
      // A new purchase invoice is always raised from a purchase order.
      this.form.controls.purchaseOrderId.addValidators(Validators.required);
      this.form.controls.purchaseOrderId.updateValueAndValidity();

      this.api.getPurchaseOrders().subscribe(
        (orders) =>
        (this.purchaseOrders = orders.filter((o: any) => {
          // Only checked orders can start a new purchase invoice.
          const label = PURCHASE_ORDER_STATUSES[o.status];
          return label === "Checked";
        })),
      );
    }
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  // Lines are never added or removed by hand: they are created from the
  // purchase order (create) or from the saved invoice (edit).
  private addItem(item: any = {}): void {
    this.items.push(
      this.fb.group({
        id: [item.id],
        productId: [item.productId ?? null, Validators.required],
        unitId: [item.unitId ?? null, Validators.required],
        // Cost is filled from the purchase order (editable, as before).
        unitCost: [item.unitCost ?? 0, [Validators.required, Validators.min(0)]],
        // Display only.
        productName: [item.productName ?? ""],
        unitName: [item.unitName ?? ""],
        // Order Qty comes from the purchase order and is never editable.
        orderQty: [{ value: item.orderQty ?? null, disabled: true }],
        // Receiving Qty = what actually arrives and goes into stock.
        receivedQty: [
          item.receivedQty ?? 1,
          [Validators.required, Validators.min(0.01)],
        ],
        batchNumber: [item.batchNumber ?? ""],
        expiryDate: [item.expiryDate ? item.expiryDate.slice(0, 10) : null],
        manufacturingDate: [
          item.manufacturingDate ? item.manufacturingDate.slice(0, 10) : null,
        ],
        // A line the purchase order marked "Cancelled" is still listed so the
        // order's item count matches, but it can't be received.
        isCancelled: [item.isCancelled ?? false],
      }),
    );

    const group = this.items.at(this.items.length - 1);
    if (this.id && !this.editMoneyFields) {
      group.get("receivedQty")?.disable();
      group.get("unitCost")?.disable();
    }
    if (item.isCancelled) {
      for (const c of ["receivedQty", "unitCost", "batchNumber", "expiryDate", "manufacturingDate"])
        group.get(c)?.disable();
    }
  }

  private loadOrderQtyForExistingInvoice(orderId: number): void {
    this.api.getPurchaseOrder(orderId).subscribe({
      next: (po: any) => {
        this.purchaseOrderNo = po.orderNo;
        const pool = (po.items ?? []).filter((i: any) => !i.isCancelled);
        for (const group of this.items.controls) {
          const idx = pool.findIndex(
            (i: any) =>
              i.productId === group.get("productId")?.value &&
              i.unitId === group.get("unitId")?.value,
          );
          if (idx < 0) continue;
          group.get("orderQty")?.setValue(pool[idx].orderQty);
          pool.splice(idx, 1); // each PO line matches one invoice line
        }
      },
      error: () => { }, // display-only; the invoice itself still loads fine
    });
  }

  onPurchaseOrderSelected(orderId: number | null): void {
    this.items.clear();
    this.supplierName = "";
    this.form.controls.supplierId.setValue(null);
    if (!orderId) return;

    this.api.getPurchaseOrder(orderId).subscribe((po: any) => {
      // Ignore a slow response if the user has already picked another order.
      if (this.form.controls.purchaseOrderId.value !== orderId) return;

      this.form.controls.supplierId.setValue(po.supplierId);
      this.supplierName = po.supplierName ?? "";
      this.purchaseOrderNo = po.orderNo;

      // Every item on the order is loaded — 1 item, 2 items, 3 items, …
      (po.items ?? []).forEach((i: any) => {
        const remainingQty = Number(i.remainingQty ?? i.orderQty ?? 0);
        if (!i.isCancelled && remainingQty <= 0) return;
        this.addItem({
          productId: i.productId,
          unitId: i.unitId,
          productName: i.productName,
          unitName: i.unitName,
          orderQty: i.orderQty,
          receivedQty: i.isCancelled ? i.orderQty : remainingQty,
          unitCost: i.lastPurchasePrice ?? 0,
          isCancelled: i.isCancelled,
        });

        // Cost isn't editable here, so if the order carries no price
        // fall back to the supplier/unit price rather than booking 0.
        if (!i.lastPurchasePrice && !i.isCancelled) {
          const group = this.items.at(this.items.length - 1);
          this.api
            .getEffectiveUnitPrice(i.productId, i.unitId, po.supplierId)
            .subscribe({
              next: (price) =>
                group.get("unitCost")?.setValue(price.purchasePrice ?? 0),
              error: () => { },
            });
        }
      });
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  // Line total = receiving qty × cost (getRawValue so locked fields still count).
  lineTotal(group: any): number {
    const v = group.getRawValue();
    return v.isCancelled ? 0 : (+v.receivedQty || 0) * (+v.unitCost || 0);
  }

  get total(): number {
    return (
      this.items.controls.reduce((sum, c: any) => sum + this.lineTotal(c), 0) -
      (+this.form.controls.discount.value! || 0) +
      (+this.form.controls.taxOrOthers.value! || 0)
    );
  }

  get due(): number {
    return Math.max(0, this.total - (+this.form.controls.advance.value! || 0));
  }

  selectReceipt(event: Event): void {
    this.receiptFile = (event.target as HTMLInputElement).files?.[0];
    if (this.receiptFile) {
      const reader = new FileReader();
      reader.onload = () => (this.receiptPreview = String(reader.result));
      reader.readAsDataURL(this.receiptFile);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  save(printAfterSave = false): void {
    if (!this.items.controls.some((g) => !g.get("isCancelled")?.value)) {
      this.snack.open("Select a purchase order to load its items.", "Close", {
        duration: 4000,
      });
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw: any = this.form.getRawValue();
    if (!raw.paymentMethod) {
      this.snack.open("Select a payment method.", "Close", {
        duration: 4000,
      });
      return;
    }
    const printWindow = printAfterSave ? window.open("", "_blank") : null;
    if (printAfterSave && !printWindow) {
      this.snack.open("Allow pop-ups to print the purchase invoice.", "Close", {
        duration: 5000,
      });
      return;
    }
    this.saving = true;
    const payload = {
      purchaseDate: raw.purchaseDate,
      supplierId: raw.supplierId,
      purchaseOrderId: raw.purchaseOrderId,
      warehouseId: raw.warehouseId,
      advance: raw.advance,
      discount: raw.discount,
      taxOrOthers: raw.taxOrOthers,
      paymentMethod: raw.paymentMethod,
      receivingStatus: raw.receivingStatus,
      total: this.total,
      due: this.due,
      paymentStatus: this.due === 0 ? "Paid" : "InComplete",
      items: raw.items
        .filter((i: any) => !i.isCancelled) // cancelled order lines aren't received
        .map((i: any) => ({
          id: this.id ? i.id : undefined,
          productId: i.productId,
          unitId: i.unitId,
          receivedQty: i.receivedQty, // qty actually received
          unitCost: i.unitCost,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate,
          manufacturingDate: i.manufacturingDate,
        })),
    };
    const request: Observable<any> = this.id
      ? this.isAdmin && this.editMoneyFields
        ? this.api.updatePurchaseInvoiceFull(this.id, payload)
        : this.api.updatePurchaseInvoice(this.id, payload)
      : this.api.createPurchaseInvoice(payload);
    request.subscribe({
      next: (result: any) => {
        const purchaseId = this.id || result?.id;
        const finish = () => this.finish(printWindow, purchaseId);
        if (!this.receiptFile || !purchaseId) {
          finish();
          return;
        }
        this.api.uploadPurchaseReceipt(purchaseId, this.receiptFile).subscribe({
          next: finish,
          error: () => {
            printWindow?.close();
            this.saving = false;
            this.snack.open(
              "Purchase saved, but receipt upload failed.",
              "Close",
              { duration: 5000 },
            );
          },
        });
      },
      error: (e: any) => {
        printWindow?.close();
        this.saving = false;
        this.snack.open(
          e.error?.message || "Could not save purchase.",
          "Close",
          { duration: 6000 },
        );
      },
    });
  }

  printCurrent(): void {
    if (!this.id) {
      this.snack.open("Save the purchase before printing it.", "Close", {
        duration: 4000,
      });
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.snack.open("Allow pop-ups to print the purchase invoice.", "Close", {
        duration: 5000,
      });
      return;
    }
    this.writePrintDocument(printWindow, this.id);
  }

  private finish(printWindow?: Window | null, purchaseId?: number): void {
    this.saving = false;
    this.snack.open(
      this.id ? "Purchase updated" : "Purchase created",
      "Close",
      { duration: 3000 },
    );
    if (printWindow && purchaseId)
      this.writePrintDocument(printWindow, purchaseId);
    this.router.navigate(["/purchases"]);
  }

  private writePrintDocument(printWindow: Window, purchaseId: number): void {
    const raw: any = this.form.getRawValue();
    const supplier = this.supplierName || "Supplier";
    const rows = raw.items
      .filter((item: any) => !item.isCancelled)
      .map((item: any) => {
        const product = item.productName || `Product #${item.productId}`;
        const unit = item.unitName || "";
        const quantity = Number(item.receivedQty || 0);
        const cost = Number(item.unitCost || 0);
        return `<tr>
          <td><div class="item-name">${this.escape(product)}</div>${unit ? `<div class="item-sub">${this.escape(unit)}</div>` : ""}</td>
          <td class="num">${quantity}</td>
          <td class="num">${cost.toFixed(2)}</td>
          <td class="num">${(quantity * cost).toFixed(2)}</td>
        </tr>`;
      })
      .join("");
    const paid = Number(raw.advance || 0);
    printWindow.document.write(`<!doctype html>
<html>
<head>
<title>Purchase #${purchaseId}</title>
<style>
  /* 80mm receipt-roll width, height auto-fits the content — no more
     printing a near-empty A4 sheet for a short invoice. */
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
  @media print { body { width: 76mm; } }
</style>
</head>
<body>
  <h1>Purchase Invoice</h1>
  <p class="meta"><b>Purchase #:</b> ${purchaseId}</p>
  <p class="meta"><b>Supplier:</b> ${this.escape(supplier)}</p>
  <p class="meta"><b>Purchase Order:</b> ${this.escape(this.purchaseOrderNo || "-")}</p>
  <p class="meta"><b>Date:</b> ${this.escape(raw.purchaseDate || "")}</p>
  <hr/>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr/>
  <table class="totals">
    <tr class="grand"><td>Total</td><td class="val">BDT ${this.total.toFixed(2)}</td></tr>
    <tr><td>Paid</td><td class="val">BDT ${paid.toFixed(2)}</td></tr>
    <tr><td>Due</td><td class="val">BDT ${this.due.toFixed(2)}</td></tr>
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

  uploadReceiptOnly(): void {
    if (!this.id || !this.receiptFile) return;
    this.saving = true;
    this.api.uploadPurchaseReceipt(this.id, this.receiptFile).subscribe({
      next: () => {
        this.saving = false;
        this.snack.open("Receipt uploaded.", "Close", { duration: 3000 });
        this.router.navigate(["/purchases"]);
      },
      error: (e: any) => {
        this.saving = false;
        this.snack.open(
          e.error?.message || "Could not upload receipt.",
          "Close",
          { duration: 6000 },
        );
      },
    });
  }
}
