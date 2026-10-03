import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { SaleReturn } from '../../../core/models/api.models';
import { SlicePipe } from '@angular/common';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { SaleReturnPrintService } from '../../../core/services/sale-return-print.service';

@Component({
  selector: 'app-sale-return-list',
  standalone: true,
  imports: [CommonModule, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `<mat-card><mat-card-header><mat-card-title>Sale Returns</mat-card-title></mat-card-header>
    <mat-card-content><p>Posted returns are locked to protect stock and accounting history.</p>
      <mat-form-field appearance="outline" class="search-field"><mat-label>Search sale returns</mat-label><input matInput [formControl]="searchControl" placeholder="Search return, sale, reason or amount"><mat-icon matSuffix>search</mat-icon></mat-form-field>
      <div class="table-wrap" *ngIf="filteredReturns.length"><table><thead><tr><th>Return no.</th><th>Date</th><th>Sale</th><th>Reason</th><th class="amount">Total</th><th>Actions</th></tr></thead>
      <tbody><tr *ngFor="let item of (filteredReturns | slice:(pageIndex * pageSize):((pageIndex + 1) * pageSize))"><td>{{ item.returnNo }}</td><td>{{ item.returnDate | date }}</td><td>#{{ item.saleId }}</td><td>{{ item.reason || '—' }}</td><td class="amount">{{ item.returnTotal | number:'1.2-2' }}</td><td class="actions"><a mat-icon-button [routerLink]="['/returns/sale', item.id]" matTooltip="View" aria-label="View"><mat-icon>visibility</mat-icon></a><button mat-icon-button type="button" (click)="print(item)" matTooltip="Print" aria-label="Print sale return"><mat-icon>print</mat-icon></button></td></tr></tbody></table></div>
      <app-pagination [totalItems]="filteredReturns.length" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize"></app-pagination>
      <p class="empty-state" *ngIf="!filteredReturns.length && !loading">No matching sale returns found.</p><p class="error" *ngIf="error">{{ error }}</p></mat-card-content>
    <mat-card-actions><a mat-flat-button color="primary" routerLink="/returns/sale/new">New sale return</a></mat-card-actions></mat-card>`,
  styles: [`
    .search-field { width:min(400px,100%); }
    .table-wrap { overflow-x:auto; border-radius:12px; box-shadow:0 6px 20px rgba(30,41,59,.06); }
    table { width:100%; min-width:760px; border-collapse:separate; border-spacing:0; }
    th,td { text-align:left; padding:12px 14px; white-space:nowrap; border-bottom:1px solid #dfe8e8; border-right:1px solid #e3ebeb; }
    th { background:#fff; color:#315e60; font-size:14px; font-weight:500; }
    th:first-child { border-top-left-radius:12px; }
    th:last-child { border-top-right-radius:12px; border-right:0; }
    td { color:#30383b; }
    tbody td:last-child { border-right:0; }
    tbody tr:hover { background:#f7fbfa; }
    .amount { text-align:right; }
    .actions { white-space:nowrap; }
    .empty-state { margin:0; padding:48px 16px; color:#777; text-align:center; }
    .error { color:#b00020; }
  `]
})
export class SaleReturnListComponent {
  private readonly api = inject(ApiService);
  private readonly printService = inject(SaleReturnPrintService);
  returns: SaleReturn[] = [];
  loading = true;
  error = '';
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl('', { nonNullable: true });

  print(item: SaleReturn): void {
    this.printService.print(item);
  }

  get filteredReturns(): SaleReturn[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.returns;
    return this.returns.filter(item => [item.returnNo, item.saleId, item.returnDate, item.reason || '', item.returnTotal]
      .join(' ').toLocaleLowerCase().includes(term));
  }

  constructor() { this.api.getSaleReturns().subscribe({ next: x => { this.returns = x.filter(r => !r.isDeleted); this.loading = false; }, error: () => { this.error = 'Could not load sale returns.'; this.loading = false; } }); }
}
