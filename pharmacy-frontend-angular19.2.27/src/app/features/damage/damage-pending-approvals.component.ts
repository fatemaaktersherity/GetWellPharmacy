import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ExpiredProductStockRead } from '../../core/models/api.models';
import { DisposalRejectionDialogComponent } from '../expired-products/pending-approvals/disposal-rejection-dialog.component';

@Component({
  selector: 'app-damage-pending-approvals',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDialogModule, MatSnackBarModule, RouterLink],
  template: `<div class="page-header">
  <div>
    <h1>Pending Damage Approvals</h1>
  <p>Damage reports await an explicit Admin or Manager approval. Stock is not removed until approved.</p>
  </div>
  <div class="header-actions">
    <a mat-stroked-button routerLink="/damage"><mat-icon>arrow_back</mat-icon> Back to Damaged Medicine</a>
  </div>
</div>
<mat-card>
  <mat-form-field appearance="outline" class="search-field">
    <mat-label>Search pending approvals</mat-label>
    <input matInput [formControl]="searchControl" placeholder="Search product, batch or requester">
    <mat-icon matSuffix>search</mat-icon>
  </mat-form-field>
  <table mat-table [dataSource]="filteredItems">
    <ng-container matColumnDef="product"><th mat-header-cell *matHeaderCellDef>Product</th><td mat-cell *matCellDef="let x">{{x.productName}}</td></ng-container>
    <ng-container matColumnDef="batch"><th mat-header-cell *matHeaderCellDef>Batch</th><td mat-cell *matCellDef="let x">{{x.batchNumber}}</td></ng-container>
    <ng-container matColumnDef="qty"><th mat-header-cell *matHeaderCellDef>Qty</th><td mat-cell *matCellDef="let x">{{x.quantity}}</td></ng-container>
    <ng-container matColumnDef="cost"><th mat-header-cell *matHeaderCellDef>Cost</th><td mat-cell *matCellDef="let x">{{x.totalCost | currency:'BDT '}}</td></ng-container>
    <ng-container matColumnDef="reason"><th mat-header-cell *matHeaderCellDef>Reason</th><td mat-cell *matCellDef="let x">{{x.note || '-'}}</td></ng-container>
    <ng-container matColumnDef="requestedBy"><th mat-header-cell *matHeaderCellDef>Requested By</th><td mat-cell *matCellDef="let x">{{x.requestedByName}}</td></ng-container>
    <ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>Requested</th><td mat-cell *matCellDef="let x">{{x.disposalDate | date:'mediumDate'}}</td></ng-container>
    <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef>Actions</th><td mat-cell *matCellDef="let x">
      <a mat-icon-button [routerLink]="['/damage/view', x.id]" [queryParams]="{ returnTo: '/damage/pending-approvals' }" aria-label="View damage report"><mat-icon>visibility</mat-icon></a>
      <a mat-icon-button [routerLink]="['/damage/edit', x.id]" [queryParams]="{ returnTo: '/damage/pending-approvals' }" aria-label="Edit damage report"><mat-icon>edit</mat-icon></a>
      <button mat-stroked-button color="primary" (click)="approve(x)">Approve</button>&nbsp;
      <button mat-stroked-button color="warn" (click)="reject(x)">Reject</button>
    </td></ng-container>
    <tr mat-header-row *matHeaderRowDef="cols"></tr>
    <tr mat-row *matRowDef="let row; columns: cols"></tr>
  </table>
  <p class="empty" *ngIf="!filteredItems.length">No damage reports awaiting approval.</p>
</mat-card>`,
  styles: [`
    .page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .search-field { width: min(400px, 100%); }
    .empty { color: #666; }
    p.empty { margin-left: 16px; }
  `]
})
export class DamagePendingApprovalsComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  items: ExpiredProductStockRead[] = [];
  cols = ['product', 'batch', 'qty', 'cost', 'reason', 'requestedBy', 'date', 'actions'];
  readonly searchControl = new FormControl('', { nonNullable: true });

  get filteredItems(): ExpiredProductStockRead[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter((item) =>
      [item.productName, item.batchNumber, item.note || '', item.requestedByName].join(' ').toLocaleLowerCase().includes(term));
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getDisposalRecords(undefined, undefined, 'PendingApproval').subscribe({
      next: (data) => (this.items = data.filter((r) => r.disposalMethod === 'Damaged')),
      error: () => this.snackbar.open('Could not load pending approvals.', 'Close', { duration: 5000 }),
    });
  }

  async approve(item: ExpiredProductStockRead) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Approve damage write-off of ${item.quantity} unit(s) of ${item.productName} (batch ${item.batchNumber}, ${item.totalCost})? This will deduct stock now.`, confirmText: 'Continue', danger: true })) return;
    this.api.approveDisposal(item.id).subscribe({
      next: () => { this.snackbar.open('Approved — stock deducted.', 'Close', { duration: 3000 }); this.load(); },
      error: (e) => this.snackbar.open(e.error?.message || 'Could not approve.', 'Close', { duration: 5000 }),
    });
  }

  reject(item: ExpiredProductStockRead): void {
    this.dialog.open(DisposalRejectionDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      data: item,
    }).afterClosed().subscribe((reason: string | undefined) => {
      if (reason === undefined) return;
      this.api.rejectDisposal(item.id, reason || undefined).subscribe({
        next: () => { this.snackbar.open('Rejected — no stock was changed.', 'Close', { duration: 3000 }); this.load(); },
        error: (e) => this.snackbar.open(e.error?.message || 'Could not reject.', 'Close', { duration: 5000 }),
      });
    });
  }
}
