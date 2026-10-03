import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ApiService } from '../../../core/services/api.service';
import {
    WarehouseFull, ProductStock, ProductRakItem, StockTransfer,
    ExpiredProductStockRead
} from '../../../core/models/api.models';

@Component({
    selector: 'app-warehouse-detail',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ReactiveFormsModule, RouterLink, MatCardModule, MatTabsModule, MatTableModule,
        MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
        MatSnackBarModule, MatProgressBarModule
    ],
    templateUrl: './warehouse-detail.component.html',
    styleUrl: './warehouse-detail.component.scss'
})
export class WarehouseDetailComponent implements OnInit {
      private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);
    private readonly fb = inject(FormBuilder);
    private readonly snackbar = inject(MatSnackBar);

    warehouseId!: number;
    warehouse?: WarehouseFull;
    warehousePhotoUrl: string | null = null;
    allWarehouses: WarehouseFull[] = [];

    stock: ProductStock[] = [];
    racks: ProductRakItem[] = [];
    outgoingTransfers: StockTransfer[] = [];
    incomingTransfers: StockTransfer[] = [];
    disposals: ExpiredProductStockRead[] = [];

    stockCols = ['product', 'batch', 'qty', 'expiry', 'unitCost'];
    rackCols = ['name', 'stockRows', 'capacity', 'status', 'actions'];
    transferCols = ['invoice', 'date', 'counterparty', 'qty', 'status', 'actions'];
    disposalCols = ['product', 'batch', 'qty', 'cost', 'method', 'date'];

    showRackForm = false;
    rackForm = this.fb.group({
        name: ['', Validators.required],
        capacity: [null as number | null],
    });

    showTransferForm = false;
    savingTransfer = false;
    transferForm = this.fb.group({
        invoiceId: ['', Validators.required],
        toWarehouseId: [null as number | null, Validators.required],
    });
    transferItems: { sourceProductStockId: number | null; medicineId: number | null; quantity: number }[] = [];
    
    get utilizationInfo(): { percent: number; mode: 'volume' | 'batches'; label: string } {
        if (!this.warehouse?.capacity) return { percent: 0, mode: 'batches', label: 'No capacity set' };

        const hasVolumeData = this.stock.some(s => !!(s as any).unitVolume);

        if (hasVolumeData) {
            const totalVolume = this.stock.reduce((sum, s) => {
                const qty = s.availableQuantity ?? s.quantity ?? 0;
                const vol = (s as any).unitVolume ?? 0;
                return sum + qty * vol;
            }, 0);
            const percent = Math.min(100, Math.round((totalVolume / this.warehouse!.capacity) * 100));
            return { percent, mode: 'volume', label: `${percent}% of volumetric capacity` };
        }

        const percent = Math.min(100, Math.round((this.stock.length / this.warehouse!.capacity) * 100));
        return { percent, mode: 'batches', label: `${percent}% of batch-slot capacity (approx. — no volume data yet)` };
    }

    ngOnInit(): void {
        this.warehouseId = Number(this.route.snapshot.paramMap.get('id'));
        this.loadAll();
        this.api.getWarehousesFull().subscribe(w => this.allWarehouses = w.filter(x => x.id !== this.warehouseId));
    }

    loadAll(): void {
        this.api.getWarehouseById(this.warehouseId).subscribe(w => {
            this.warehouse = w;
            this.api.getWarehousePhoto(this.warehouseId).subscribe({
                next: blob => {
                    if (blob.size > 0) this.warehousePhotoUrl = URL.createObjectURL(blob);
                }
            });
        });
        this.api.getProductStocks(this.warehouseId).subscribe(s => this.stock = s);
        this.api.getProductRaks(this.warehouseId).subscribe(r => this.racks = r);
        this.api.getDisposalRecords(this.warehouseId).subscribe(d => this.disposals = d);
        this.api.getStockTransfers().subscribe(t => {
            this.outgoingTransfers = t.filter(x => x.fromWarehouseId === this.warehouseId);
            this.incomingTransfers = t.filter(x => x.toWarehouseId === this.warehouseId);
        });
    }

    // ── Racks ──────────────────────────────────────────────────────────────
    addRack(): void {
        if (this.rackForm.invalid) return;
        this.api.createProductRak({
            name: this.rackForm.value.name!,
            isActive: true,
            warehouseId: this.warehouseId,
            capacity: this.rackForm.value.capacity ?? undefined
        }).subscribe({
            next: () => { this.rackForm.reset(); this.showRackForm = false; this.loadAll(); },
            error: (e: any) => this.snackbar.open(e.error?.message || 'Failed to add rack', 'Close', { duration: 5000 })
        });
    }

    async deleteRack(id: number) {
        if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Delete this rack?', confirmText: 'Continue', danger: true })) return;
        this.api.deleteProductRak(id).subscribe(() => this.loadAll());
    }

    rackUtilization(r: ProductRakItem): number {
        if (!r.capacity) return 0;
        return Math.min(100, Math.round((r.stockRowCount / r.capacity) * 100));
    }

    // ── Transfers ──────────────────────────────────────────────────────────
    addTransferLine(): void {
        this.transferItems.push({ sourceProductStockId: null, medicineId: null, quantity: 1 });
    }

    removeTransferLine(index: number): void {
        this.transferItems.splice(index, 1);
    }

    onSourceStockChanged(line: { sourceProductStockId: number | null; medicineId: number | null; quantity: number }): void {
        const stock = this.stock.find(s => s.stockId === line.sourceProductStockId);
        line.medicineId = stock?.productId ?? null;
    }

    submitTransfer(): void {
        if (this.transferForm.invalid || this.transferItems.length === 0) {
            this.snackbar.open('Add at least one line item.', 'Close', { duration: 4000 });
            return;
        }
        if (this.transferItems.some(i => !i.sourceProductStockId || !i.quantity)) {
            this.snackbar.open('Each line needs a batch and quantity.', 'Close', { duration: 4000 });
            return;
        }
        this.savingTransfer = true;
        const raw = this.transferForm.getRawValue();
        this.api.createStockTransfer({
            invoiceId: raw.invoiceId!,
            toWarehouseId: raw.toWarehouseId!,
            fromWarehouseId: this.warehouseId,
            items: this.transferItems.map(i => ({
                sourceProductStockId: i.sourceProductStockId!,
                medicineId: i.medicineId!,
                quantity: i.quantity
            }))
        }).subscribe({
            next: () => {
                this.savingTransfer = false;
                this.showTransferForm = false;
                this.transferForm.reset();
                this.transferItems = [];
                this.snackbar.open('Transfer created', 'Close', { duration: 3000 });
                this.loadAll();
            },
            error: (e: any) => {
                this.savingTransfer = false;
                this.snackbar.open(e.error?.message || 'Failed to create transfer', 'Close', { duration: 5000 });
            }
        });
    }

    async markReceived(t: StockTransfer) {
        if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Confirm stock from "${t.fromWarehouseName}" has arrived?`, confirmText: 'Continue', danger: true })) return;
        this.api.markTransferReceived(t.id, t.invoiceId).subscribe({
            next: () => { this.snackbar.open('Marked as received', 'Close', { duration: 3000 }); this.loadAll(); },
            error: () => this.snackbar.open('Failed to update', 'Close', { duration: 5000 })
        });
    }

    // Only sensible before receipt — once stock has actually moved
    // warehouses, deleting the record wouldn't put the stock back.
    async deleteTransfer(t: StockTransfer) {
        if (t.isReceived) { this.snackbar.open('Already received — cannot delete.', 'Close', { duration: 4000 }); return; }
        if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete this transfer to/from "${t.toWarehouseName || t.fromWarehouseName}"? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
        this.api.deleteStockTransfer(t.id).subscribe({
            next: () => { this.snackbar.open('Transfer deleted', 'Close', { duration: 3000 }); this.loadAll(); },
            error: (e: any) => this.snackbar.open(e.error?.message || 'Failed to delete transfer', 'Close', { duration: 5000 })
        });
    }

    uploadReceipt(t: StockTransfer, event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.api.uploadTransferReceipt(t.id, file).subscribe({
            next: () => { this.snackbar.open('Receipt uploaded', 'Close', { duration: 3000 }); this.loadAll(); },
            error: () => this.snackbar.open('Upload failed', 'Close', { duration: 5000 })
        });
    }
}
