import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../../core/services/api.service';
import { SalePrintService } from '../../../core/services/sale-print.service';
import { Sale } from '../../../core/models/api.models';
import { CollectPaymentDialogComponent } from '../collect-payment-dialog/collect-payment-dialog.component';
import { MessageDialogService } from '../../../shared/message-dialog/message-dialog.service';
import { InputPromptDialogComponent } from '../../../shared/input-prompt-dialog/input-prompt-dialog.component';

@Component({
  selector: 'app-sale-view',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './sale-view.component.html',
  styleUrl: './sale-view.component.scss',
})
export class SaleViewComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly salePrint = inject(SalePrintService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly messageDialog = inject(MessageDialogService);

  sale?: Sale;

  ngOnInit(): void {
    this.api.getSale(Number(this.route.snapshot.paramMap.get('id'))).subscribe({
      next: (s) => (this.sale = s),
      error: () => this.router.navigate(['/sales']),
    });
  }

  printSale(): void {
    if (this.sale) this.salePrint.print(this.sale);
  }

  collectPayment(): void {
    if (!this.sale) return;
    this.dialog.open(CollectPaymentDialogComponent, {
      width: '380px',
      data: { saleId: this.sale.saleId, paymentMethod: this.sale.paymentMethod, dueAmount: this.sale.dueAmount ?? this.netAmount() }
    }).afterClosed().subscribe(result => {
      if (!result || !this.sale) return;
      this.api.recordSalePayment(this.sale.saleId, result.paymentMethod, result.amount).subscribe({
        next: (s) => (this.sale = s),
        error: (e) => this.messageDialog.error(e?.error?.message || 'Could not record payment.'),
      });
    });
  }

  voidSale(): void {
    if (!this.sale) return;
    const saleId = this.sale.saleId;
    this.dialog.open(InputPromptDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      data: { title: `Void Sale #${saleId}`, fields: [{ key: 'reason', label: 'Reason for voiding', required: true }] },
    }).afterClosed().subscribe(async (result) => {
      const reason = result?.['reason'].trim();
      if (!reason || !await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: 'Void this sale? Stock and accounting will be reversed.', confirmText: 'Continue', danger: true })) return;
      this.api.voidSale(saleId, reason).subscribe({
        next: () => this.router.navigate(['/sales']),
        error: (e) => this.messageDialog.error(e?.error?.message || 'Could not void the sale.'),
      });
    });
  }

  isFullyReturned(): boolean {
    return !!this.sale?.hasReturns && (this.sale.returnedAmount ?? 0) >= this.sale.totalAmount;
  }

  statusLabel(): string {
    if (!this.sale) return '';
    if (this.sale.hasReturns) return this.isFullyReturned() ? 'Returned' : 'Partially Returned';
    return this.sale.isPaid ? 'Paid' : 'Due';
  }

  /** What the customer actually owes: subtotal minus discount. */
  netAmount(): number {
    if (!this.sale) return 0;
    return this.sale.netAmount ?? this.sale.totalAmount - (this.sale.discount ?? 0);
  }

  prescriptionUrl(): string | null {
    return this.api.assetUrl(this.sale?.prescriptionImagePath);
  }
}
