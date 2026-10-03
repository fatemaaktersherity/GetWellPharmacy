import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
@Component({
  selector: 'app-expired-product-list',
  standalone: true,
  imports: [CommonModule, SlicePipe, PaginationComponent, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, RouterLink],
  templateUrl: './expired-product-list.component.html',
  styleUrl: './expired-product-list.component.scss'
})
export class ExpiredProductListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService); private readonly snackbar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  items: any[] = [];
  get canManage(): boolean { return this.auth.hasRole('Admin', 'Manager'); }
  get cols(): string[] { return this.canManage ? ['product','batch','expiry','quantity','actions'] : ['product','batch','expiry','quantity']; }
  pageIndex = 0; pageSize = 10;
  approvalThreshold: number | null = null;
  pendingCount = 0;
  readonly searchControl = new FormControl('', { nonNullable: true });
  get filteredItems(): any[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter(item => [item.productName, item.batchNumber, item.expiryDate, item.quantity, item.warehouseName]
      .join(' ').toLocaleLowerCase().includes(term));
  }
  ngOnInit(): void {
    this.load();
    this.api.getDisposalApprovalThreshold().subscribe({ next: (t) => (this.approvalThreshold = t) });
    this.loadPendingCount();
  }
  load(): void { this.api.getExpiredProductStocks().subscribe({ next: (data) => this.items = data, error: () => this.snackbar.open('Failed', 'Close', { duration: 5000 }) }); }
  loadPendingCount(): void {
    this.api.getDisposalRecords(undefined, undefined, 'PendingApproval').subscribe({
      next: (records) => (this.pendingCount = records.filter((r) => r.disposalMethod !== 'Damaged').length),
    });
  }
  async dispose(item: any, method: 'Write-off' | 'Returned') {
    if (!this.canManage) return;
    const note = method === 'Returned' ? 'Expired — returned to supplier for credit' : 'Expired — destroyed';
    const confirmMsg = method === 'Returned'
      ? `Mark ${item.quantity} unit(s) of ${item.productName} (batch ${item.batchNumber}) as returned to the supplier?`
      : `Write off ${item.quantity} unit(s) of ${item.productName} (batch ${item.batchNumber}) as destroyed?`;
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: confirmMsg, confirmText: 'Continue', danger: true })) return;
    this.api.createDisposal({ productStockId: item.stockId, quantity: item.quantity, disposalMethod: method, note }).subscribe({
      next: (record) => {
        const message = record.approvalStatus === 'PendingApproval'
          ? 'Above the approval threshold — sent to another Admin or Manager for sign-off before stock is removed.'
          : (method === 'Returned' ? 'Marked as returned to supplier' : 'Written off');
        this.snackbar.open(message, 'Close', { duration: record.approvalStatus === 'PendingApproval' ? 6000 : 3000 });
        this.load();
        this.loadPendingCount();
      },
      error: (e) => this.snackbar.open(e.error?.message || 'Failed', 'Close', { duration: 5000 })
    });
  }
}
