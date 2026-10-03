import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { ApiService } from '../../../core/services/api.service';
import { Supplier, SupplierPayment } from '../../../core/models/api.models';

@Component({
  selector: 'app-supplier-payment-list',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, DatePipe, RouterLink,
    MatCardModule, MatTableModule, MatButtonModule, MatIconModule,
    MatSnackBarModule, MatExpansionModule,
  ],
  templateUrl: './supplier-payment-list.component.html',
  styleUrl: './supplier-payment-list.component.scss',
})
export class SupplierPaymentListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);

  supplierId = 0;
  supplier: Supplier | null = null;
  payments: SupplierPayment[] = [];

  get totalPaid(): number {
    return this.payments.filter((p) => !p.isCancelled).reduce((sum, p) => sum + p.totalAmount, 0);
  }

  ngOnInit(): void {
    this.supplierId = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getSupplier(this.supplierId).subscribe((s) => (this.supplier = s));
    this.load();
  }

  load(): void {
    this.api.getSupplierPayments(this.supplierId).subscribe({
      next: (p) => (this.payments = p),
      error: () => this.snackbar.open('Could not load payment history.', 'Close', { duration: 5000 }),
    });
  }

  receiptUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }

  uploadReceipt(payment: SupplierPayment, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.api.uploadSupplierPaymentReceipt(payment.id, file).subscribe({
      next: () => {
        this.snackbar.open('Receipt uploaded.', 'Close', { duration: 3000 });
        this.load();
      },
      error: () => this.snackbar.open('Could not upload receipt.', 'Close', { duration: 5000 }),
    });
  }

  // A posted voucher can't be un-cancelled or hard-deleted by the backend —
  // cancelling is the safe, audit-preserving way to void a mistaken payment.
  async cancel(payment: SupplierPayment) {
    if (payment.isCancelled) return;
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Cancel payment ${payment.paidNo}? This restores the due amount on its invoice(s).`, confirmText: 'Continue', danger: true })) return;
    this.api
      .updateSupplierPayment(payment.id, {
        paidNo: payment.paidNo,
        paidDate: payment.paidDate,
        paymentMethod: payment.paymentMethod,
        isCancelled: true,
      })
      .subscribe({
        next: () => {
          this.snackbar.open('Payment cancelled.', 'Close', { duration: 3000 });
          this.load();
        },
        error: (e: any) =>
          this.snackbar.open(e.error?.message || 'Could not cancel payment.', 'Close', { duration: 6000 }),
      });
  }

  // Only ever succeeds for a voucher that was never posted to the ledger —
  // the backend rejects deleting a posted one, matching cancel()'s note above.
  async delete(payment: SupplierPayment) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Permanently delete payment ${payment.paidNo}? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteSupplierPayment(payment.id).subscribe({
      next: () => {
        this.snackbar.open('Payment deleted.', 'Close', { duration: 3000 });
        this.load();
      },
      error: (e: any) =>
        this.snackbar.open(e.error?.message || 'Could not delete payment.', 'Close', { duration: 6000 }),
    });
  }
}
