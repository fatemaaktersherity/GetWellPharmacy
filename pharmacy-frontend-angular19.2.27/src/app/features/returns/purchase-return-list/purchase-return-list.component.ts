import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { PurchaseReturn } from '../../../core/models/api.models';
import { SlicePipe } from '@angular/common';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PurchaseReturnPrintService } from '../../../core/services/purchase-return-print.service';

@Component({
  selector: 'app-purchase-return-list',
  standalone: true,
  imports: [CommonModule, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  template: `<mat-card><mat-card-header><mat-card-title>Purchase Returns</mat-card-title></mat-card-header>
    <mat-card-content><p>Each row means the return was recorded and stock was reduced. Open View to record a cash refund or confirmed supplier credit.</p>
      <mat-form-field appearance="outline" class="search-field"><mat-label>Search purchase returns</mat-label><input matInput [formControl]="searchControl" placeholder="Search return, invoice, reason or amount"><mat-icon matSuffix>search</mat-icon></mat-form-field>
      <div class="table-wrap" *ngIf="filteredReturns.length"><table><thead><tr><th>Return no.</th><th>Date</th><th>Invoice</th><th>Reason</th><th class="amount">Total</th><th class="amount">Credited / refunded</th><th class="amount">Remaining</th><th>Status</th><th>Receipt</th><th>Actions</th></tr></thead>
      <tbody><tr *ngFor="let item of (filteredReturns | slice:(pageIndex * pageSize):((pageIndex + 1) * pageSize))"><td>{{ item.returnNo }}</td><td>{{ item.returnDate | date }}</td><td>#{{ item.purchaseInvoiceId }}</td><td>{{ item.reason || '—' }}</td><td class="amount">{{ item.returnTotal | number:'1.2-2' }}</td><td class="amount">{{ settledAmount(item) | number:'1.2-2' }}</td><td class="amount">{{ remainingAmount(item) | number:'1.2-2' }}</td><td><span class="status" [class.status-complete]="remainingAmount(item) === 0">{{ settlementStatus(item) }}</span></td><td><a *ngIf="receiptUrl(item) as receipt" [href]="receipt" target="_blank" matTooltip="View receipt"><img class="receipt-thumb" [src]="receipt" alt="Receipt image"></a><span *ngIf="!receiptUrl(item)">—</span></td><td class="actions"><a mat-icon-button [routerLink]="['/returns/purchase', item.id]" matTooltip="View" aria-label="View return"><mat-icon>visibility</mat-icon></a><button mat-icon-button type="button" (click)="print(item)" matTooltip="Print" aria-label="Print purchase return"><mat-icon>print</mat-icon></button></td></tr></tbody></table></div>
      <app-pagination [totalItems]="filteredReturns.length" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize"></app-pagination>
      <p class="empty-state" *ngIf="!filteredReturns.length && !loading">No matching purchase returns found.</p><p class="error" *ngIf="error">{{ error }}</p></mat-card-content>
    <mat-card-actions><a mat-flat-button color="primary" routerLink="/returns/purchase/new">New purchase return</a></mat-card-actions></mat-card>`,
  styles: [`
    .search-field { width:min(400px,100%); }
    .table-wrap { overflow-x:auto; border-radius:12px; box-shadow:0 6px 20px rgba(30,41,59,.06); }
    table { width:100%; min-width:1180px; border-collapse:separate; border-spacing:0; }
    th,td { text-align:left; padding:12px 14px; white-space:nowrap; border-bottom:1px solid #dfe8e8; border-right:1px solid #e3ebeb; }
    th { background:#fff; color:#315e60; font-size:14px; font-weight:500; }
    th:first-child { border-top-left-radius:12px; }
    th:last-child { border-top-right-radius:12px; border-right:0; }
    td { color:#30383b; }
    tbody td:last-child { border-right:0; }
    tbody tr:hover { background:#f7fbfa; }
    .amount { text-align:right; }
    .actions { white-space:nowrap; }
    .status { display:inline-block; padding:4px 8px; border-radius:999px; background:#fff3df; color:#895b00; white-space:nowrap; font-size:12px; font-weight:600; }
    .status-complete { background:#e6f5ec; color:#176b3a; }
    .receipt-thumb { display:block; width:42px; height:42px; object-fit:cover; border-radius:6px; }
    .empty-state { margin:0; padding:48px 16px; color:#777; text-align:center; }
    .error { color:#b00020; }
  `]
})
export class PurchaseReturnListComponent {
  private readonly api = inject(ApiService);
  private readonly printService = inject(PurchaseReturnPrintService);
  returns: PurchaseReturn[] = [];
  loading = true;
  error = '';
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl('', { nonNullable: true });

  receiptUrl(item: PurchaseReturn): string | null {
    const pathUrl = this.api.assetUrl(item.receiptImagePath);
    if (pathUrl) return pathUrl;
    if (!item.receiptImage) return null;
    const contentType = item.receiptImageContentType || 'image/jpeg';
    return `data:${contentType};base64,${item.receiptImage}`;
  }

  print(item: PurchaseReturn): void {
    this.printService.print(item);
  }

  settledAmount(item: PurchaseReturn): number {
    return (item.receives ?? []).reduce((sum, record) => sum + record.receivedAmount, 0);
  }

  remainingAmount(item: PurchaseReturn): number {
    return Math.max(0, item.returnTotal - this.settledAmount(item));
  }

  settlementStatus(item: PurchaseReturn): string {
    const settled = this.settledAmount(item);
    if (this.remainingAmount(item) === 0) return 'Credit settled';
    return settled > 0 ? 'Partially settled' : 'Awaiting supplier credit';
  }

  get filteredReturns(): PurchaseReturn[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.returns;
    return this.returns.filter(item => [item.returnNo, item.purchaseInvoiceId, item.returnDate, item.reason || '', item.returnTotal]
      .join(' ').toLocaleLowerCase().includes(term));
  }

  constructor() { this.api.getPurchaseReturns().subscribe({ next: x => { this.returns = x; this.loading = false; }, error: () => { this.error = 'Could not load purchase returns.'; this.loading = false; } }); }
}
