import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
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
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-expired-history',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, ReactiveFormsModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, RouterLink],
  templateUrl: './expired-history.component.html',
  styleUrl: './expired-history.component.scss',
})
export class ExpiredHistoryComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  items: any[] = [];
  get canManage(): boolean { return this.auth.hasRole('Admin', 'Manager'); }
  get cols(): string[] { return this.canManage ? ['product', 'batch', 'qty', 'cost', 'method', 'status', 'date', 'actions'] : ['product', 'batch', 'qty', 'cost', 'method', 'status', 'date']; }
  readonly searchControl = new FormControl('', { nonNullable: true });

  get filteredItems(): any[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.items;
    return this.items.filter((item) =>
      [item.productName, item.batchNumber, item.disposalMethod, item.note || '', item.requestedByName, item.approvedByName || '']
        .join(' ').toLocaleLowerCase().includes(term),
    );
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getDisposalRecords().subscribe({
      next: (x) => (this.items = x.filter((r) => r.disposalMethod !== 'Damaged' && r.approvalStatus !== 'PendingApproval')),
      error: () => this.snackbar.open('Could not load disposal history.', 'Close', { duration: 5000 }),
    });
  }

  async undo(item: any) {
    if (!this.canManage) return;
    if (item.approvalStatus !== 'Approved') return;
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Undo this disposal and restore the stock quantity?', confirmText: 'Continue', danger: true })) return;
    this.api.deleteDisposal(item.id).subscribe({
      next: () => { this.snackbar.open('Disposal undone, stock restored', 'Close', { duration: 3000 }); this.load(); },
      error: (e) => this.snackbar.open(e.error?.message || 'Could not undo.', 'Close', { duration: 5000 }),
    });
  }
}
