import { Component, inject, OnInit } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { StockTransfer, Warehouse } from '../../core/models/api.models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductStock } from '../../core/models/api.models';

@Component({
  selector: 'app-stock-transfers',
  standalone: true,
  imports: [
    DatePipe, SlicePipe, PaginationComponent, ReactiveFormsModule, FormsModule, RouterLink,
    MatCardModule, MatTableModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatIconModule, MatButtonModule, MatChipsModule, MatSnackBarModule
  ],
  templateUrl: './stock-transfers.component.html',
  styleUrl: './stock-transfers.component.scss'
})
export class StockTransfersComponent implements OnInit {
  private readonly api: ApiService = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);

  transfers: StockTransfer[] = [];
  pageIndex = 0; pageSize = 10;
  warehouses: Warehouse[] = [];
  isLoading = true;
  showCreateForm = false;
  savingTransfer = false;
  sourceStocks: ProductStock[] = [];
  transferItems: { sourceProductStockId: number | null; medicineId: number | null; quantity: number }[] = [];
  readonly transferForm = new FormGroup({
    invoiceId: new FormControl(this.newReferenceNo(), { nonNullable: true, validators: [Validators.required] }),
    fromWarehouseId: new FormControl<number | null>(null, Validators.required),
    toWarehouseId: new FormControl<number | null>(null, Validators.required)
  });

  readonly displayedColumns: string[] = ['invoice', 'date', 'from', 'to', 'qty', 'status', 'actions'];

  readonly filters: FormGroup = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    fromWarehouseId: new FormControl<number | null>(null),
    toWarehouseId: new FormControl<number | null>(null),
    status: new FormControl<'all' | 'received' | 'pending'>('all', { nonNullable: true })
  });

  get filteredTransfers(): StockTransfer[] {
    const { search, fromWarehouseId, toWarehouseId, status } = this.filters.value;
    const term = (search ?? '').trim().toLocaleLowerCase();

    return this.transfers.filter(t => {
      if (fromWarehouseId && t.fromWarehouseId !== fromWarehouseId) return false;
      if (toWarehouseId && t.toWarehouseId !== toWarehouseId) return false;
      if (status === 'received' && !t.isReceived) return false;
      if (status === 'pending' && t.isReceived) return false;
      if (!term) return true;
      return [t.invoiceId, t.fromWarehouseName || '', t.toWarehouseName || '']
        .join(' ').toLocaleLowerCase().includes(term);
    });
  }

  ngOnInit(): void {
    this.api.getWarehouses().subscribe(w => {
      this.warehouses = w.filter(x => x.isActive);
    });
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.api.getStockTransfers().subscribe({
      next: t => {
        this.transfers = t.sort((a, b) => new Date(b.transferDate).getTime() - new Date(a.transferDate).getTime());
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; }
    });
  }

  resetFilters(): void {
    this.filters.reset({ search: '', fromWarehouseId: null, toWarehouseId: null, status: 'all' });
  }

  loadSourceStocks(warehouseId: number | null): void {
    this.sourceStocks = [];
    this.transferItems = [];
    if (this.transferForm.controls.toWarehouseId.value === warehouseId) {
      this.transferForm.controls.toWarehouseId.setValue(null);
    }
    if (!warehouseId) return;
    this.api.getProductStocks(warehouseId).subscribe({
      next: stocks => this.sourceStocks = stocks.filter(s => (s.availableQuantity ?? s.quantity) > 0),
      error: () => this.snackbar.open('Could not load stock for the selected warehouse.', 'Close', { duration: 4000 })
    });
  }

  addTransferLine(): void {
    this.transferItems.push({ sourceProductStockId: null, medicineId: null, quantity: 1 });
  }

  onStockSelected(line: { sourceProductStockId: number | null; medicineId: number | null; quantity: number }): void {
    line.medicineId = this.sourceStocks.find(s => s.stockId === line.sourceProductStockId)?.productId ?? null;
  }

  submitTransfer(): void {
    if (this.transferForm.invalid || this.transferItems.length === 0 || this.transferItems.some(i => !i.sourceProductStockId || !i.medicineId || i.quantity <= 0)) {
      this.snackbar.open('Choose both warehouses and add at least one batch with a valid quantity.', 'Close', { duration: 4500 });
      return;
    }
    const { invoiceId, fromWarehouseId, toWarehouseId } = this.transferForm.getRawValue();
    if (fromWarehouseId === toWarehouseId) {
      this.snackbar.open('From and to warehouses must be different.', 'Close', { duration: 4000 });
      return;
    }
    const exceedsStock = this.transferItems.some(i => {
      const stock = this.sourceStocks.find(s => s.stockId === i.sourceProductStockId);
      return !stock || i.quantity > (stock.availableQuantity ?? stock.quantity);
    });
    if (exceedsStock) {
      this.snackbar.open('Transfer quantity cannot exceed the selected batch’s available stock.', 'Close', { duration: 4500 });
      return;
    }
    this.savingTransfer = true;
    this.api.createStockTransfer({
      invoiceId, fromWarehouseId: fromWarehouseId!, toWarehouseId: toWarehouseId!,
      items: this.transferItems.map(i => ({ sourceProductStockId: i.sourceProductStockId!, medicineId: i.medicineId!, quantity: i.quantity }))
    }).subscribe({
      next: () => {
        this.savingTransfer = false;
        this.showCreateForm = false;
        this.transferForm.patchValue({ invoiceId: this.newReferenceNo(), fromWarehouseId, toWarehouseId });
        this.transferItems = [];
        this.snackbar.open('Stock transfer created. Mark it received when it arrives at the destination.', 'Close', { duration: 5000 });
        this.load();
        this.loadSourceStocks(fromWarehouseId);
      },
      error: (e: any) => {
        this.savingTransfer = false;
        this.snackbar.open(e.error?.message || 'Failed to create stock transfer.', 'Close', { duration: 5000 });
      }
    });
  }

  availableForStock(stockId: number | null): number | null {
    const stock = this.sourceStocks.find(s => s.stockId === stockId);
    return stock ? (stock.availableQuantity ?? stock.quantity) : null;
  }

  private newReferenceNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `ST-${date}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
}
