import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatSortModule } from "@angular/material/sort";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTabsModule } from "@angular/material/tabs";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatInputModule } from "@angular/material/input";
import { ApiService } from "../../core/services/api.service";
import { PaginationComponent } from "../../shared/pagination/pagination.component";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import {
  ProductStock,
  Warehouse,
  ExpiredProductStock,
  ExpiredProductStockRead,
} from "../../core/models/api.models";

/** One row of the "All Products" tab — a single product's stock summed
 *  across every warehouse, plus the per-warehouse breakdown for display. */
interface ProductStockSummary {
  productId: number;
  productName: string;
  productCode?: string;
  productImagePath?: string;
  unitName?: string;
  totalQuantity: number;
  breakdown: { warehouseName: string; quantity: number }[];
}

@Component({
  selector: "app-inventory",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatSnackBarModule,
    PaginationComponent,
  ],
  templateUrl: "./inventory.component.html",
  styleUrl: "./inventory.component.scss",
})
export class InventoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);

  // Tabs
  selectedTab = 0;

  // Product Stocks (Current Inventory) — scoped by the Warehouse Filter
  productStocks: ProductStock[] = [];
  warehouses: Warehouse[] = [];
  selectedWarehouseId: number | null = null;

  // Expired Stocks
  expiredStocks: ExpiredProductStock[] = [];
  // Damage reports are kept as individual product quantities, not as whole batches.
  damagedProducts: ExpiredProductStockRead[] = [];

  get filteredDamagedProducts(): ExpiredProductStockRead[] {
    return this.damagedProducts.filter((record) =>
      record.disposalMethod === "Damaged" &&
      (!this.selectedWarehouseId || record.warehouseId === this.selectedWarehouseId),
    );
  }

  // Pagination (simple) — Current Stocks tab
  pageSize = 10;
  currentPage = 0;

  // Client-side search across product name and batch number.
  readonly searchControl = new FormControl("", { nonNullable: true });

  get filteredStocks(): ProductStock[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.productStocks;
    return this.productStocks.filter(
      (s) =>
        s.productName?.toLocaleLowerCase().includes(term) ||
        s.batchNumber?.toLocaleLowerCase().includes(term),
    );
  }

  // ── All Products tab: every batch across every warehouse, unaffected by
  // the Warehouse Filter above, grouped and summed per product. ──────────
  allProductStocks: ProductStock[] = [];
  readonly productSearchControl = new FormControl("", { nonNullable: true });
  productPageSize = 10;
  productCurrentPage = 0;

  get groupedProductStocks(): ProductStockSummary[] {
    const byProduct = new Map<number, ProductStockSummary>();
    for (const s of this.allProductStocks) {
      let entry = byProduct.get(s.productId);
      if (!entry) {
        entry = {
          productId: s.productId,
          productName: s.productName,
          productCode: s.productCode,
          productImagePath: s.productImagePath,
          unitName: s.unitName,
          totalQuantity: 0,
          breakdown: [],
        };
        byProduct.set(s.productId, entry);
      }
      entry.totalQuantity += s.quantity;
      const existingWarehouse = entry.breakdown.find(
        (b) => b.warehouseName === s.warehouseName,
      );
      if (existingWarehouse) {
        existingWarehouse.quantity += s.quantity;
      } else {
        entry.breakdown.push({
          warehouseName: s.warehouseName,
          quantity: s.quantity,
        });
      }
    }
    return Array.from(byProduct.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    );
  }

  get filteredProductSummaries(): ProductStockSummary[] {
    const term = this.productSearchControl.value.trim().toLocaleLowerCase();
    const grouped = this.groupedProductStocks;
    if (!term) return grouped;
    return grouped.filter(
      (p) =>
        p.productName?.toLocaleLowerCase().includes(term) ||
        p.productCode?.toLocaleLowerCase().includes(term),
    );
  }

  get paginatedProductSummaries(): ProductStockSummary[] {
    const start = this.productCurrentPage * this.productPageSize;
    return this.filteredProductSummaries.slice(
      start,
      start + this.productPageSize,
    );
  }

  get productTotalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.filteredProductSummaries.length / this.productPageSize),
    );
  }

  productPreviousPage(): void {
    if (this.productCurrentPage > 0) this.productCurrentPage--;
  }

  productNextPage(): void {
    if (this.productCurrentPage < this.productTotalPages - 1)
      this.productCurrentPage++;
  }

  ngOnInit(): void {
    this.loadWarehouses();
    this.loadProductStocks();
    this.loadExpiredStocks();
    this.loadDamagedProducts();
    this.loadAllProductStocks();
    this.searchControl.valueChanges.subscribe(() => (this.currentPage = 0));
    this.productSearchControl.valueChanges.subscribe(
      () => (this.productCurrentPage = 0),
    );
  }

  loadWarehouses(): void {
    this.api.getWarehouses().subscribe({
      next: (w) => (this.warehouses = w),
      error: () => this.showLoadError("warehouses"),
    });
  }

  loadProductStocks(): void {
    this.api.getProductStocks(this.selectedWarehouseId || undefined).subscribe({
      next: (s) => {
        this.productStocks = s;
        this.currentPage = 0;
      },
      error: () => this.showLoadError("stock"),
    });
  }

  /** Always fetched unfiltered — this powers the "All Products" tab, which
   *  is intentionally independent of the Warehouse Filter dropdown. */
  loadAllProductStocks(): void {
    this.api.getProductStocks().subscribe({
      next: (s) => {
        this.allProductStocks = s;
        this.productCurrentPage = 0;
      },
      error: () => this.showLoadError("product totals"),
    });
  }

  loadExpiredStocks(): void {
    this.api.getExpiredProductStocks().subscribe({
      next: (e) => (this.expiredStocks = e),
      error: () => this.showLoadError("expired stock"),
    });
  }

  loadDamagedProducts(): void {
    this.api.getDisposalRecords().subscribe({
      next: (records) => {
        this.damagedProducts = records.filter((record) => record.disposalMethod === "Damaged");
      },
      error: () => this.showLoadError("damaged products"),
    });
  }

  refreshInventory(): void {
    this.loadProductStocks();
    this.loadExpiredStocks();
    this.loadDamagedProducts();
    this.loadAllProductStocks();
  }

  onWarehouseChange(): void {
    this.loadProductStocks();
  }

  // Get paginated data (Current Stocks tab)
  getPaginatedStocks(): ProductStock[] {
    const start = this.currentPage * this.pageSize;
    return this.filteredStocks.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredStocks.length / this.pageSize));
  }

  previousPage(): void {
    if (this.currentPage > 0) this.currentPage--;
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) this.currentPage++;
  }

  imageUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }

  private showLoadError(resource: string): void {
    this.snackbar.open(`Could not load ${resource}.`, "Close", {
      duration: 5000,
    });
  }
}
