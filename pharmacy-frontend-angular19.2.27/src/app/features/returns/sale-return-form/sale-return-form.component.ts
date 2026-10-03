import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { Sale, SaleItem, SaleReturn } from '../../../core/models/api.models';

/** One packaging this line's product can be returned in — its own base unit
 * (factor 1) plus every configured pack size (Strip, Box, ...). */
interface ReturnUnitOption { unitId: number; unitName: string; baseQuantity: number; }

@Component({
  selector: 'app-sale-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <div class="return-page">
      <!-- ========================= FORM ========================= -->
      <mat-card class="form-card">
        <mat-card-header><mat-card-title>New Sale Return</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="hint">Select the original sale and its line. The system keeps the original package, selling price, batch and cost.</p>
          <mat-form-field appearance="outline"><mat-label>Original sale</mat-label>
            <mat-select [(ngModel)]="saleId" name="saleId" (selectionChange)="loadSale()">
              <mat-option *ngFor="let sale of sales" [value]="sale.saleId">Sale #{{ sale.saleId }} — {{ sale.saleDate | date }} — {{ sale.totalAmount | number:'1.2-2' }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="selectedSale"><mat-label>Item to return</mat-label>
            <mat-select [(ngModel)]="saleItemId" name="saleItemId" (selectionChange)="onItemChange()">
              <mat-option *ngFor="let item of selectedSale.items" [value]="item.saleItemId">Batch line #{{ item.saleItemId }} — {{ item.quantity }} {{ item.unitName || '' }}{{ item.baseQuantity && item.baseQuantity !== item.quantity ? ' (' + item.baseQuantity + ' base units)' : '' }} at {{ item.unitPrice | number:'1.2-2' }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="returnUnitOptions.length > 1"><mat-label>Return in</mat-label>
            <mat-select [(ngModel)]="returnUnitId" name="returnUnitId">
              <mat-option *ngFor="let opt of returnUnitOptions" [value]="opt.unitId">{{ opt.unitName }}</mat-option>
            </mat-select>
          </mat-form-field>
          <p class="hint" *ngIf="returnUnitOptions.length > 1">Sold as {{ selectedItem?.unitName }}, but you can return it as any of this product's configured packagings — e.g. a few loose Pcs out of a Strip.</p>
          <mat-form-field appearance="outline"><mat-label>Return quantity{{ maxReturnQuantity !== null ? ' (max ' + maxReturnQuantity + ' ' + (selectedReturnUnitName || '') + ')' : '' }}</mat-label><input matInput type="number" min="0.01" [max]="maxReturnQuantity ?? null" [(ngModel)]="quantity" name="quantity"></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Reason</mat-label><textarea matInput [(ngModel)]="reason" name="reason"></textarea></mat-form-field>
          <p class="success" *ngIf="success">{{ success }}</p>
          <p class="error" *ngIf="error">{{ error }}</p>
        </mat-card-content>
        <mat-card-actions><button mat-flat-button color="primary" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Create return' }}</button></mat-card-actions>
      </mat-card>

      <!-- ========================= LIST ========================= -->
      <mat-card class="list-card">
        <mat-card-header><mat-card-title>Sale Returns</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="hint">Posted returns are locked to protect stock and accounting history.</p>
          <mat-form-field appearance="outline" class="search-field"><mat-label>Search sale returns</mat-label><input matInput [formControl]="searchControl" placeholder="Search return, sale, reason or amount"><mat-icon matSuffix>search</mat-icon></mat-form-field>
          <table *ngIf="pagedReturns.length">
            <thead><tr><th>Return no.</th><th>Date</th><th>Sale</th><th>Reason</th><th class="amount">Total</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let item of pagedReturns">
                <td>{{ item.returnNo }}</td>
                <td>{{ item.returnDate | date }}</td>
                <td>#{{ item.saleId }}</td>
                <td>{{ item.reason || '—' }}</td>
                <td class="amount">{{ item.returnTotal | number:'1.2-2' }}</td>
                <td>
                  <a mat-icon-button [routerLink]="['/returns/sale', item.id]" aria-label="View sale return" title="View">
                    <mat-icon>visibility</mat-icon>
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="pager" *ngIf="filteredReturns.length">
            <button mat-stroked-button (click)="page = page - 1" [disabled]="page === 0">Previous</button>
            <span>Page {{ page + 1 }} of {{ totalPages }}</span>
            <button mat-stroked-button (click)="page = page + 1" [disabled]="page >= totalPages - 1">Next</button>
          </div>
          <p *ngIf="!filteredReturns.length && !loadingReturns">No matching sale returns found.</p>
          <p class="error" *ngIf="listError">{{ listError }}</p>
        </mat-card-content>
      </mat-card>
    </div>`,
  styles: [`
    .return-page { display:flex; flex-wrap:wrap; gap:24px; align-items:flex-start; }
    .form-card { flex: 0 1 420px; min-width: 320px; }
    .list-card { flex: 1 1 480px; min-width: 320px; }
    .hint { color:#555; }
    .form-card mat-form-field { width:100%; display:block; }
    .search-field { width:100%; max-width:420px; display:block; }
    .error { color:#b00020; }
    .success { color:#1b7a1b; }
    table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:10px; border-bottom:1px solid #ddd; }
    .amount { text-align:right; }
    .pager { display:flex; align-items:center; gap:12px; justify-content:center; margin-top:12px; }
  `]
})
export class SaleReturnFormComponent implements OnInit {
  private readonly api = inject(ApiService);

  // ---- form state ----
  sales: Sale[] = []; selectedSale?: Sale; saleId?: number; saleItemId?: number; quantity?: number; reason = ''; saving = false; error = ''; success = '';

  // Which packaging the return is being taken in (e.g. Pcs instead of the
  // Strip it was originally sold as) and the options available for it.
  returnUnitId?: number;
  returnUnitOptions: ReturnUnitOption[] = [];

  get selectedItem(): SaleItem | undefined {
    return this.selectedSale?.items.find((x: SaleItem) => x.saleItemId === this.saleItemId);
  }

  get selectedReturnUnitName(): string | undefined {
    return this.returnUnitOptions.find(o => o.unitId === this.returnUnitId)?.unitName;
  }

  // Upper bound shown to the cashier before submitting — how many of the
  // chosen return unit this line still has left, converted from the
  // original sale's base quantity. The server re-checks this for real
  // (it also knows about any earlier partial returns), so this is a
  // best-effort hint, not the final word.
  get maxReturnQuantity(): number | null {
    const item = this.selectedItem;
    const opt = this.returnUnitOptions.find(o => o.unitId === this.returnUnitId);
    if (!item?.baseQuantity || !opt?.baseQuantity) return item ? item.quantity : null;
    return Math.floor((item.baseQuantity / opt.baseQuantity) * 100) / 100;
  }

  onItemChange(): void {
    this.returnUnitOptions = [];
    this.returnUnitId = undefined;
    const item = this.selectedItem;
    if (!item) return;
    this.returnUnitOptions = [{ unitId: item.unitId, unitName: item.unitName || 'unit', baseQuantity: 1 }];
    this.returnUnitId = item.unitId;
    if (!item.productId) return;
    this.api.getProduct(item.productId).subscribe({
      next: product => {
        const options: ReturnUnitOption[] = [{ unitId: product.unitId, unitName: product.unitName, baseQuantity: 1 }];
        for (const p of product.prices || []) {
          if (p.unitId === product.unitId) continue;
          options.push({ unitId: p.unitId, unitName: p.unitName || p.displayName || `unit ${p.unitId}`, baseQuantity: p.baseQuantity });
        }
        this.returnUnitOptions = options;
        if (!options.some(o => o.unitId === this.returnUnitId)) this.returnUnitId = item.unitId;
      },
      error: () => { /* packaging list is a nice-to-have; the original sale unit above still works */ }
    });
  }

  // ---- list state ----
  returns: SaleReturn[] = [];
  loadingReturns = true;
  listError = '';
  readonly searchControl = new FormControl('', { nonNullable: true });
  page = 0;
  readonly pageSize = 10;

  get filteredReturns(): SaleReturn[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.returns;
    return this.returns.filter(item => [item.returnNo, item.saleId, item.returnDate, item.reason || '', item.returnTotal]
      .join(' ').toLocaleLowerCase().includes(term));
  }
  get pagedReturns(): SaleReturn[] { return this.filteredReturns.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredReturns.length / this.pageSize)); }

  ngOnInit(): void {
    this.loadSales();
    this.loadReturns();
    this.searchControl.valueChanges.subscribe(() => this.page = 0);
  }

  // ---- form actions ----
  loadSales(): void { this.api.getSales().subscribe({ next: sales => this.sales = sales, error: () => this.error = 'Could not load sales.' }); }
  loadSale(): void { this.selectedSale = undefined; this.saleItemId = undefined; this.returnUnitId = undefined; this.returnUnitOptions = []; if (!this.saleId) return; this.api.getSale(this.saleId).subscribe({ next: sale => this.selectedSale = sale, error: () => this.error = 'Could not load the selected sale.' }); }
  save(): void {
    this.success = '';
    if (!this.saleId || !this.saleItemId || !this.quantity || this.quantity <= 0) { this.error = 'Select a sale item and enter a valid quantity.'; return; }
    const item = this.selectedSale?.items.find((x: SaleItem) => x.saleItemId === this.saleItemId);
    if (!item) { this.error = 'Select a sale item and enter a valid quantity.'; return; }
    if (this.maxReturnQuantity !== null && this.quantity > this.maxReturnQuantity) { this.error = 'Return quantity cannot exceed the original sold quantity.'; return; }
    this.saving = true; this.error = '';
    this.api.createSaleReturn({ returnNo: `SR-${Date.now()}`, returnDate: new Date().toISOString(), saleId: this.saleId, reason: this.reason || undefined, items: [{ saleItemId: this.saleItemId, unitId: this.returnUnitId !== item.unitId ? this.returnUnitId : undefined, quantity: this.quantity }] })
      .subscribe({
        next: () => {
          this.saving = false;
          this.success = 'Sale return created successfully.';
          this.resetForm();
          this.page = 0;
          this.loadReturns();
        },
        error: e => { this.saving = false; this.error = e?.error?.message || 'Could not create the sale return.'; }
      });
  }
  private resetForm(): void {
    this.saleId = undefined; this.saleItemId = undefined; this.quantity = undefined; this.reason = ''; this.selectedSale = undefined;
    this.returnUnitId = undefined; this.returnUnitOptions = [];
  }

  // ---- list actions ----
  loadReturns(): void {
    this.loadingReturns = true;
    this.api.getSaleReturns().subscribe({
      next: x => { this.returns = x.filter(r => !r.isDeleted); this.loadingReturns = false; },
      error: () => { this.listError = 'Could not load sale returns.'; this.loadingReturns = false; }
    });
  }
}