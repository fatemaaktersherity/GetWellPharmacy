import { ConfirmDialogService } from '../../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { forkJoin, of, Observable, switchMap } from "rxjs";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import {
  Product,
  Unit,
  Supplier,
  SupplierType,
  PurchaseOrderItem,
  SupplierProduct,
  PURCHASE_ORDER_SOURCES,
  PURCHASE_ORDER_STATUSES,
} from "../../../../core/models/api.models";
import { ApiService } from "../../../../core/services/api.service";
import { PurchaseOrderPrintService } from "../../../../core/services/purchase-order-print.service";

// Blocks a new order line whose (current stock + order qty) would go above the
// product's Maximum Stock Qty from the product master.
function maxStockValidator(group: AbstractControl): ValidationErrors | null {
  const max = group.get("maxStockQty")?.value;
  if (max === null || max === undefined) return null; // no product picked yet
  const stock = +group.get("stockQty")?.value || 0;
  const order = +group.get("orderQty")?.value || 0;
  return stock + order > max
    ? { exceedsMax: { max, stock, allowed: Math.max(0, max - stock) } }
    : null;
}

@Component({
  selector: "app-purchase-order-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: "./purchase-order-form.component.html",
  styleUrl: "./purchase-order-form.component.scss",
})
export class PurchaseOrderFormComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly poPrint = inject(PurchaseOrderPrintService);

  suppliers: Supplier[] = [];
  products: Product[] = [];
  units: Unit[] = [];
  supplierTypes: SupplierType[] = [];
  supplierProducts: SupplierProduct[] = [];
  sources = PURCHASE_ORDER_SOURCES;
  statuses = [0, 1, 2, 4].map((value) => ({ label: PURCHASE_ORDER_STATUSES[value], value }));

  id?: number;
  saving = false;
  receiptFile?: File;
  receiptPreview?: string | null;

  form = this.fb.group({
    orderNo: [""], // optional — blank means "auto-generate" on the backend
    orderDate: [new Date().toISOString().slice(0, 10), Validators.required],
    requirementDate: [""],
    supplierId: [null as number | null, Validators.required],
    supplierTypeId: [null as number | null],
    source: [1, Validators.required], // default Manual
    status: [0, Validators.required], // default Draft
    isUrgent: [false],
    items: this.fb.array([]),
  });

  get items(): FormArray {
    return this.form.controls.items as FormArray;
  }

  get selectedSupplier(): Supplier | undefined {
    const id = this.form.controls.supplierId.value;
    return this.suppliers.find((s) => s.supplierId === id);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id");
    this.id = id ? +id : undefined;

    this.api.getSuppliers().subscribe((s) => (this.suppliers = s));
    this.api.getProducts().subscribe((p) => {
      // Replenishment orders may be created while a product is still in stock.
      // Keep the full catalog available in both create and edit modes.
      this.products = p;
      // Lines loaded (edit mode) before the product list arrived.
      for (const group of this.items.controls) this.applyProductLimits(group);
    });
    this.api.getUnits().subscribe((u) => (this.units = u));
    this.api.getSupplierTypes().subscribe((t) => (this.supplierTypes = t));
    this.form.controls.supplierId.valueChanges
      .pipe(
        switchMap((supplierId) =>
          supplierId
            ? this.api.getSupplierProductsBySupplier(supplierId)
            : of([] as SupplierProduct[]),
        ),
      )
      .subscribe((supplierProducts) => {
        this.supplierProducts = supplierProducts;
        for (const group of this.items.controls) {
          this.autofillLastPurchasePrice(group, true);
        }
      });

    if (this.id) {
      this.api.getPurchaseOrder(this.id).subscribe((order) => {
        this.form.patchValue({
          orderNo: order.orderNo,
          orderDate: order.orderDate?.slice(0, 10),
          requirementDate: order.requirementDate?.slice(0, 10) ?? "",
          supplierId: order.supplierId,
          supplierTypeId: order.supplierTypeId ?? null,
          source: order.source,
          status: order.status,
          isUrgent: order.isUrgent,
        });
        this.receiptPreview = this.api.assetUrl(order.receiptImagePath);
        order.items.forEach((i) => this.addItem(i));
      });
    } else {
      this.addItem();
    }
  }

  // Copies Min/Max stock from the product master onto the line so they show up
  // as a hint the moment a product is selected. `autofillStock` also pulls the
  // product's current stock into "Current Stock Qty" (only for brand-new lines
  // the user is picking a product on — never when loading a saved order).
  private applyProductLimits(group: AbstractControl, autofillStock = false): void {
    const product = this.products.find(
      (p) => p.id === group.get("productId")?.value,
    );
    group.get("minStockQty")?.setValue(product ? product.minStockQty : null);
    group.get("maxStockQty")?.setValue(product ? product.maxStockQty : null);
    group.get("productUnitName")?.setValue(product?.unitName ?? "");
    if (autofillStock && product) {
      group.get("stockQty")?.setValue(product.stockQuantity ?? 0);
    }
  }

  addItem(item: Partial<PurchaseOrderItem> = {}): void {
    const group = this.fb.group(
      {
        id: [item.id],
        productId: [item.productId ?? null, Validators.required],
        unitId: [item.unitId ?? null, Validators.required],
        lastPurchasePrice: [
          item.lastPurchasePrice ?? 0,
          [Validators.required, Validators.min(0)],
        ],
        stockQty: [
          item.stockQty ?? 0,
          [Validators.required, Validators.min(0)],
        ],
        requiredQty: [
          item.requiredQty ?? 0,
          [Validators.required, Validators.min(0)],
        ],
        orderQty: [
          item.orderQty ?? 0,
          [Validators.required, Validators.min(0)],
        ],
        isCancelled: [item.isCancelled ?? false],
        // UI-only (not sent to the API): product's stock limits for the hint.
        minStockQty: [null as number | null],
        maxStockQty: [null as number | null],
        productUnitName: [""],
      },
      // Only enforce the max-stock rule on brand-new lines — an existing
      // line can still be edited (e.g. fixing the price) without being
      // blocked by a max-stock check that didn't apply when it was added.
      { validators: item.id ? [] : [maxStockValidator] },
    );

    group.get("productId")?.valueChanges.subscribe(() => {
      this.applyProductLimits(group, !item.id);
      this.autofillLastPurchasePrice(group, true);
    });
    group.get("unitId")?.valueChanges.subscribe(() =>
      this.autofillLastPurchasePrice(group, true),
    );
    this.applyProductLimits(group);
    this.items.push(group);
  }

  private autofillLastPurchasePrice(
    group: AbstractControl,
    clearIfUnavailable = false,
  ): void {
    // Existing order lines keep their saved snapshot. Only new lines receive
    // the selected supplier's latest recorded price as a starting value.
    if (group.get("id")?.value) return;

    const supplierId = this.form.controls.supplierId.value;
    const productId = group.get("productId")?.value;
    const unitId = group.get("unitId")?.value;
    if (!supplierId || !productId || !unitId) return;

    const supplierProduct = this.supplierProducts.find(
      (link) => link.supplierId === supplierId && link.productId === productId,
    );
    const lastPurchasePrice =
      (supplierProduct && supplierProduct.lastPurchaseUnitId === unitId
        ? supplierProduct.lastPurchaseUnitCost
        : undefined) ??
      supplierProduct?.prices?.find((price) => price.unitId === unitId)
        ?.purchasePrice;

    if (lastPurchasePrice !== undefined && lastPurchasePrice !== null) {
      group.get("lastPurchasePrice")?.setValue(lastPurchasePrice);
    } else if (clearIfUnavailable) {
      group.get("lastPurchasePrice")?.setValue(0);
    }
  }

  async removeItem(i: number) {
    const group = this.items.at(i);
    const existingId = group.get("id")?.value;
    if (this.id && existingId) {
      if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: "Remove this line item from the order?", confirmText: 'Continue', danger: true })) return;
      this.api.removePurchaseOrderItem(this.id, existingId).subscribe({
        next: () => this.items.removeAt(i),
        error: () =>
          this.snackbar.open("Could not remove item.", "Close", {
            duration: 5000,
          }),
      });
    } else {
      this.items.removeAt(i);
    }
  }

  selectReceipt(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.receiptFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.receiptPreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  printOrder(): void {
    const value = this.form.getRawValue();
    const supplier = this.suppliers.find(s => s.supplierId === value.supplierId);
    const supplierType = this.supplierTypes.find(t => t.id === value.supplierTypeId);
    const order = {
      id: this.id ?? 0,
      orderNo: value.orderNo?.trim() || (this.id ? "" : "DRAFT"),
      orderDate: value.orderDate ?? "",
      requirementDate: value.requirementDate || undefined,
      supplierId: value.supplierId ?? 0,
      supplierName: supplier?.supplierName ?? "",
      supplierTypeId: value.supplierTypeId ?? undefined,
      supplierTypeName: supplierType?.name,
      source: value.source as any,
      status: value.status as any,
      isUrgent: value.isUrgent ?? false,
      createdAt: new Date().toISOString(),
      items: (value.items as any[]).map(item => ({
        ...item,
        productName: this.products.find(p => p.id === item.productId)?.productName,
        unitName: this.units.find(u => u.unitId === item.unitId)?.unitName,
      })),
    };
    this.poPrint.print(order as any);
  }

  save(): void {
    const overMax = this.items.controls
      .filter((g) => g.hasError("exceedsMax"))
      .map((g) => this.products.find((p) => p.id === g.get("productId")?.value)?.productName ?? "a product");
    if (overMax.length) {
      this.form.markAllAsTouched();
      this.snackbar.open(
        `Order qty is above the maximum stock level for: ${overMax.join(", ")}.`,
        "Close",
        { duration: 6000 },
      );
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();

    const afterSave = (orderId: number) => {
      if (this.receiptFile) {
        this.api
          .uploadPurchaseOrderReceipt(orderId, this.receiptFile)
          .subscribe({
            next: () => this.finishSave(orderId),
            error: () => {
              this.snackbar.open(
                "Order saved, but receipt upload failed.",
                "Close",
                { duration: 6000 },
              );
              this.finishSave(orderId);
            },
          });
      } else {
        this.finishSave(orderId);
      }
    };

    if (this.id) {
      const orderId = this.id;
      this.api
        .updatePurchaseOrder(orderId, {
          supplierId: v.supplierId!,
          supplierTypeId: v.supplierTypeId ?? undefined,
          source: v.source as any,
          status: v.status as any,
          isUrgent: v.isUrgent!,
          requirementDate: v.requirementDate || undefined,
        })
        .subscribe({
          next: () => {
            // Header saved — now push each line's own changes (price, qty,
            // product/unit, cancelled). Existing lines (have an id) go
            // through PUT .../items/{itemId}; brand-new lines added on this
            // screen (no id yet) go through POST .../items.
            const itemRequests: Observable<unknown>[] = (v.items as any[]).map((i) => {
              const payload = {
                productId: i.productId,
                unitId: i.unitId,
                lastPurchasePrice: i.lastPurchasePrice,
                stockQty: i.stockQty,
                requiredQty: i.requiredQty,
                orderQty: i.orderQty,
                isCancelled: i.isCancelled,
              };
              return i.id
                ? this.api.updatePurchaseOrderItem(orderId, i.id, payload)
                : this.api.addPurchaseOrderItem(orderId, payload);
            });

            const itemsSynced: Observable<unknown> = itemRequests.length
              ? forkJoin(itemRequests)
              : of(null);

            itemsSynced.subscribe({
              next: () => afterSave(orderId),
              error: (e: any) => {
                this.saving = false;
                this.snackbar.open(
                  e.error?.message ||
                    "Order header saved, but one or more line items failed to save.",
                  "Close",
                  { duration: 6000 },
                );
              },
            });
          },
          error: (e: any) => {
            this.saving = false;
            this.snackbar.open(
              e.error?.message || "Could not update purchase order.",
              "Close",
              { duration: 6000 },
            );
          },
        });
    } else {
      this.api
        .createPurchaseOrder({
          orderNo: v.orderNo?.trim() || undefined,
          orderDate: v.orderDate!,
          requirementDate: v.requirementDate || undefined,
          supplierId: v.supplierId!,
          supplierTypeId: v.supplierTypeId ?? undefined,
          source: v.source as any,
          status: v.status as any,
          isUrgent: v.isUrgent!,
          items: (v.items as any[]).map((i) => ({
            productId: i.productId,
            unitId: i.unitId,
            lastPurchasePrice: i.lastPurchasePrice,
            stockQty: i.stockQty,
            requiredQty: i.requiredQty,
            orderQty: i.orderQty,
            isCancelled: i.isCancelled,
          })),
        })
        .subscribe({
          next: (created) => afterSave(created.id),
          error: (e) => {
            this.saving = false;
            this.snackbar.open(
              e.error?.message || "Could not create purchase order.",
              "Close",
              { duration: 6000 },
            );
          },
        });
    }
  }

  private finishSave(orderId: number): void {
    this.saving = false;
    this.snackbar.open("Purchase order saved.", "Close", { duration: 3000 });
    this.router.navigate(["/purchase-orders", orderId]);
  }
}
