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
import { PurchaseInvoice, PurchaseInvoiceItem, PurchaseReturn } from '../../../core/models/api.models';

@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <div class="return-page">
      <!-- ========================= FORM ========================= -->
      <mat-card class="form-card">
        <mat-card-header><mat-card-title>New Purchase Return</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="hint">Select the original purchase line. The system returns stock from the recorded batch and retains its original cost.</p>
          <mat-form-field appearance="outline"><mat-label>Original purchase invoice</mat-label>
            <mat-select [(ngModel)]="purchaseInvoiceId" name="purchaseInvoiceId" (selectionChange)="loadInvoice()">
              <mat-option *ngFor="let invoice of invoices" [value]="invoice.id">{{ invoice.invoiceNo }} — {{ invoice.purchaseDate | date }} — {{ invoice.supplierName || 'Supplier' }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="selectedInvoice"><mat-label>Item to return</mat-label>
            <mat-select [(ngModel)]="purchaseInvoiceItemId" name="purchaseInvoiceItemId">
              <mat-option *ngFor="let item of selectedInvoice.items" [value]="item.id">{{ item.productName || ('Product #' + item.productId) }} — {{ item.batchNumber || 'No batch' }} — {{ item.receivedQty }} {{ item.unitName || '' }} at {{ item.unitCost | number:'1.2-2' }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Return quantity</mat-label><input matInput type="number" min="0.01" [(ngModel)]="quantity" name="quantity"></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Reason</mat-label><textarea matInput [(ngModel)]="reason" name="reason"></textarea></mat-form-field>
          <p class="success" *ngIf="success">{{ success }}</p>
          <p class="error" *ngIf="error">{{ error }}</p>
        </mat-card-content>
        <mat-card-actions><button mat-flat-button color="primary" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Create return' }}</button></mat-card-actions>
      </mat-card>

      <!-- ========================= LIST ========================= -->
      <mat-card class="list-card">
        <mat-card-header><mat-card-title>Purchase Returns</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="hint">Posted returns are locked to protect stock and accounting history.</p>
          <mat-form-field appearance="outline" class="search-field"><mat-label>Search purchase returns</mat-label><input matInput [formControl]="searchControl" placeholder="Search return, invoice, reason or amount"><mat-icon matSuffix>search</mat-icon></mat-form-field>
          <table *ngIf="pagedReturns.length">
            <thead><tr><th>Return no.</th><th>Date</th><th>Invoice</th><th>Reason</th><th class="amount">Total</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let item of pagedReturns">
                <td>{{ item.returnNo }}</td>
                <td>{{ item.returnDate | date }}</td>
                <td>#{{ item.purchaseInvoiceId }}</td>
                <td>{{ item.reason || '—' }}</td>
                <td class="amount">{{ item.returnTotal | number:'1.2-2' }}</td>
                <td>
                  <a mat-icon-button [routerLink]="['/returns/purchase', item.id]" aria-label="View purchase return" title="View">
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
          <p *ngIf="!filteredReturns.length && !loadingReturns">No matching purchase returns found.</p>
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
export class PurchaseReturnFormComponent implements OnInit {
  private readonly api = inject(ApiService);

  // ---- form state ----
  invoices: PurchaseInvoice[] = []; selectedInvoice?: PurchaseInvoice; purchaseInvoiceId?: number; purchaseInvoiceItemId?: number; quantity?: number; reason = ''; saving = false; error = ''; success = '';

  // ---- list state ----
  returns: PurchaseReturn[] = [];
  loadingReturns = true;
  listError = '';
  readonly searchControl = new FormControl('', { nonNullable: true });
  page = 0;
  readonly pageSize = 10;

  get filteredReturns(): PurchaseReturn[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.returns;
    return this.returns.filter(item => [item.returnNo, item.purchaseInvoiceId, item.returnDate, item.reason || '', item.returnTotal]
      .join(' ').toLocaleLowerCase().includes(term));
  }
  get pagedReturns(): PurchaseReturn[] { return this.filteredReturns.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize); }
  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredReturns.length / this.pageSize)); }

  ngOnInit(): void {
    this.loadInvoices();
    this.loadReturns();
    this.searchControl.valueChanges.subscribe(() => this.page = 0);
  }

  // ---- form actions ----
  loadInvoices(): void { this.api.getPurchaseInvoices().subscribe({ next: invoices => this.invoices = invoices, error: () => this.error = 'Could not load purchase invoices.' }); }
  loadInvoice(): void { this.selectedInvoice = undefined; this.purchaseInvoiceItemId = undefined; if (!this.purchaseInvoiceId) return; this.api.getPurchaseInvoice(this.purchaseInvoiceId).subscribe({ next: invoice => this.selectedInvoice = invoice, error: () => this.error = 'Could not load the selected invoice.' }); }
  save(): void {
    this.success = '';
    if (!this.purchaseInvoiceId || !this.purchaseInvoiceItemId || !this.quantity || this.quantity <= 0) { this.error = 'Select an invoice item and enter a valid quantity.'; return; }
    const item = this.selectedInvoice?.items.find((x: PurchaseInvoiceItem) => x.id === this.purchaseInvoiceItemId);
    if (!item || this.quantity > item.receivedQty) { this.error = 'Return quantity cannot exceed the original purchased quantity.'; return; }
    this.saving = true; this.error = '';
    this.api.createPurchaseReturn({ returnNo: `PR-${Date.now()}`, returnDate: new Date().toISOString(), purchaseInvoiceId: this.purchaseInvoiceId, reason: this.reason || undefined, items: [{ purchaseInvoiceItemId: this.purchaseInvoiceItemId, quantity: this.quantity }] })
      .subscribe({
        next: () => {
          this.saving = false;
          this.success = 'Purchase return created successfully.';
          this.resetForm();
          this.page = 0;
          this.loadReturns();
        },
        error: e => { this.saving = false; this.error = e?.error?.message || 'Could not create the purchase return.'; }
      });
  }
  private resetForm(): void {
    this.purchaseInvoiceId = undefined; this.purchaseInvoiceItemId = undefined; this.quantity = undefined; this.reason = ''; this.selectedInvoice = undefined;
  }

  // ---- list actions ----
  loadReturns(): void {
    this.loadingReturns = true;
    this.api.getPurchaseReturns().subscribe({
      next: x => { this.returns = x; this.loadingReturns = false; },
      error: () => { this.listError = 'Could not load purchase returns.'; this.loadingReturns = false; }
    });
  }
}