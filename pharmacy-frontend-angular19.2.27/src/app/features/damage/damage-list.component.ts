import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-damage-list',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, PaginationComponent, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, RouterLink],
  template: `<div class="page-header">
  <div>
    <h1>Damaged Medicine</h1>
    <p>Every damage report needs an explicit Admin or Manager approval before stock is removed.</p>
  </div>
  <div class="header-actions">
    <a *ngIf="canReviewDamage" mat-stroked-button routerLink="/damage/pending-approvals">
      <mat-icon>fact_check</mat-icon> Pending Approvals
      <span class="badge" *ngIf="pendingCount > 0">{{pendingCount}}</span>
    </a>
    <a mat-raised-button color="primary" routerLink="/damage/new"><mat-icon>add</mat-icon> Report Damage</a>
  </div>
</div><mat-card><mat-form-field appearance="outline" class="search-field"><mat-label>Search damaged medicine</mat-label><input matInput [formControl]="searchControl" placeholder="Search product, batch, cost or reason"><mat-icon matSuffix>search</mat-icon></mat-form-field><table mat-table [dataSource]="filteredItems | slice:(pageIndex * pageSize):((pageIndex + 1) * pageSize)"><ng-container matColumnDef="product"><th mat-header-cell *matHeaderCellDef>Product</th><td mat-cell *matCellDef="let x">{{x.productName}}</td></ng-container><ng-container matColumnDef="batch"><th mat-header-cell *matHeaderCellDef>Batch</th><td mat-cell *matCellDef="let x">{{x.batchNumber}}</td></ng-container><ng-container matColumnDef="qty"><th mat-header-cell *matHeaderCellDef>Base Qty</th><td mat-cell *matCellDef="let x">{{x.quantity}}</td></ng-container><ng-container matColumnDef="cost"><th mat-header-cell *matHeaderCellDef>Write-off Cost</th><td mat-cell *matCellDef="let x">{{x.totalCost | currency:'BDT '}}</td></ng-container><ng-container matColumnDef="reason"><th mat-header-cell *matHeaderCellDef>Reason</th><td mat-cell *matCellDef="let x">{{x.note || '-'}}</td></ng-container><ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th><td mat-cell *matCellDef="let x"><span class="status-badge" [class.rejected]="x.approvalStatus === 'Rejected'" [matTooltip]="x.approvalStatus === 'Rejected' ? (x.rejectionReason || 'No reason given') : ('Approved by ' + x.approvedByName)">{{x.approvalStatus === 'Rejected' ? 'Rejected' : 'Approved'}}</span></td></ng-container><ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>Date</th><td mat-cell *matCellDef="let x">{{x.disposalDate | date:'mediumDate'}}</td></ng-container><ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef>Actions</th><td mat-cell *matCellDef="let x">@if (canReviewDamage && x.approvalStatus === 'Approved') {<button mat-icon-button color="warn" (click)="delete(x)" aria-label="Undo damage report"><mat-icon>undo</mat-icon></button>}</td></ng-container><tr mat-header-row *matHeaderRowDef="cols"></tr><tr mat-row *matRowDef="let row;columns:cols"></tr></table><app-pagination [totalItems]="filteredItems.length" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize"></app-pagination><p class="empty" *ngIf="!filteredItems.length">No damaged medicine records found.</p></mat-card>`,
  styles: [`
    .page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .search-field { width:min(400px,100%); }
    .badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; margin-left:6px; border-radius:999px; background:#c62828; color:#fff; font-size:11px; font-weight:600; }
    .status-badge { display:inline-block; padding:2px 10px; border-radius:12px; background:#e8f5e9; color:#2e7d32; font-weight:500; cursor:default; }
    .status-badge.rejected { background:#eeeeee; color:#616161; }
    .empty { margin:0; padding:48px 16px; color:#777; text-align:center; }
  `]
})
export class DamageListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);
  private auth = inject(AuthService);
  items: any[] = [];
  pageIndex = 0; pageSize = 10;
  pendingCount = 0;
  cols = ['product','batch','qty','cost','reason','status','date','actions'];
  readonly searchControl = new FormControl('', { nonNullable: true });
  get canReviewDamage(): boolean { return this.auth.hasRole('Admin', 'Manager'); }
  get filteredItems(): any[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter(item => [item.productName, item.batchNumber, item.quantity, item.totalCost, item.note || '']
      .join(' ').toLocaleLowerCase().includes(term));
  }
  ngOnInit(): void {
    this.load();
    this.loadPendingCount();
  }
  load(): void {
    this.api.getDisposalRecords().subscribe(x =>
      this.items = x.filter(r => r.disposalMethod === 'Damaged' && r.approvalStatus !== 'PendingApproval'));
  }
  loadPendingCount(): void {
    this.api.getDisposalRecords(undefined, undefined, 'PendingApproval').subscribe({
      next: (records) => (this.pendingCount = records.filter((r) => r.disposalMethod === 'Damaged').length),
    });
  }
  async delete(item: any) {
    if (item.disposalMethod !== 'Damaged' || item.approvalStatus !== 'Approved') return;
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Undo this damage report and restore stock?', confirmText: 'Continue', danger: true })) return;
    this.api.deleteDisposal(item.id).subscribe({
      next: () => { this.snackbar.open('Damage report undone, stock restored', 'Close', { duration: 3000 }); this.load(); },
      error: (e) => this.snackbar.open(e.error?.message || 'Could not undo.', 'Close', { duration: 5000 }),
    });
  }
}
