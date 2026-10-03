import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExpiredProductStockRead } from '../../../core/models/api.models';
import { DisposalRejectionDialogComponent } from './disposal-rejection-dialog.component';

@Component({
  selector: 'app-pending-approvals',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDialogModule, MatSnackBarModule, RouterLink],
  templateUrl: './pending-approvals.component.html',
  styleUrl: './pending-approvals.component.scss',
})
export class PendingApprovalsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  items: ExpiredProductStockRead[] = [];
  get canManage(): boolean { return this.auth.hasRole('Admin', 'Manager'); }
  get cols(): string[] { return this.canManage ? ['product', 'batch', 'qty', 'cost', 'method', 'requestedBy', 'date', 'actions'] : ['product', 'batch', 'qty', 'cost', 'method', 'requestedBy', 'date']; }
  readonly searchControl = new FormControl('', { nonNullable: true });

  get filteredItems(): ExpiredProductStockRead[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter((item) =>
      [item.productName, item.batchNumber, item.disposalMethod, item.requestedByName].join(' ').toLocaleLowerCase().includes(term),
    );
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getDisposalRecords(undefined, undefined, 'PendingApproval').subscribe({
      next: (data) => (this.items = data.filter((r) => r.disposalMethod !== 'Damaged')),
      error: () => this.snackbar.open('Could not load pending approvals.', 'Close', { duration: 5000 }),
    });
  }

  isOwnRequest(item: ExpiredProductStockRead): boolean {
    // Admins can resolve their own pending disposal; Managers need another
    // authorized person to review their request.
    return !this.auth.isAdmin() && this.auth.currentUserId() === item.requestedByUserId;
  }

  approve(item: ExpiredProductStockRead): void {
    if (!this.canManage) return;
    this.dialog.open(DisposalApprovalDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      data: item,
    }).afterClosed().subscribe((approved: boolean | undefined) => {
      if (!approved) return;
      this.api.approveDisposal(item.id).subscribe({
        next: () => { this.snackbar.open('Approved — stock deducted.', 'Close', { duration: 3000 }); this.load(); },
        error: (e) => this.snackbar.open(e.error?.message || 'Could not approve.', 'Close', { duration: 5000 }),
      });
    });
  }

  reject(item: ExpiredProductStockRead): void {
    if (!this.canManage) return;
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

@Component({
  selector: 'app-disposal-approval-dialog',
  standalone: true,
  imports: [CurrencyPipe, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Approve Disposal</h2>
    <mat-dialog-content>
      <p>Approve {{ data.quantity }} unit(s) of {{ data.productName }}?</p>
      <p class="details">Batch {{ data.batchNumber }} · {{ data.totalCost | currency:'BDT ' }}</p>
      <p class="warning">Approving this request will deduct the stock now.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close(false)">Cancel</button>
      <button mat-flat-button color="primary" type="button" (click)="dialogRef.close(true)">Approve</button>
    </mat-dialog-actions>
  `,
  styles: [`mat-dialog-content p:first-child { margin-top: 0; } .details { color: #647572; } .warning { color: #9a5a00; }`],
})
export class DisposalApprovalDialogComponent {
  readonly data = inject<ExpiredProductStockRead>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<DisposalApprovalDialogComponent, boolean>);
}
