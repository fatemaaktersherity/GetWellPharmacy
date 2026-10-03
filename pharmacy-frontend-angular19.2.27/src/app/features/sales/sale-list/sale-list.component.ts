import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe, SlicePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../../core/services/api.service';
import { SalePrintService } from '../../../core/services/sale-print.service';
import { Sale } from '../../../core/models/api.models';
import { CollectPaymentDialogComponent } from '../collect-payment-dialog/collect-payment-dialog.component';
import { MessageDialogService } from '../../../shared/message-dialog/message-dialog.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { InputPromptDialogComponent } from '../../../shared/input-prompt-dialog/input-prompt-dialog.component';

@Component({
  selector: 'app-sale-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './sale-list.component.html',
  styleUrl: './sale-list.component.scss'
})
export class SaleListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly salePrint = inject(SalePrintService);
  private readonly dialog = inject(MatDialog);
  private readonly messageDialog = inject(MessageDialogService);
  sales: Sale[] = [];
  pageIndex = 0; pageSize = 10;
  readonly searchControl = new FormControl('', { nonNullable: true });

  get filteredSales(): Sale[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.sales;
    return this.sales.filter(sale => [
      sale.saleId,
      sale.customerName || 'Walk-in',
      sale.totalAmount, 
      sale.discount ?? '', 
      this.netAmount(sale),
      sale.saleDate,
      this.statusLabel(sale),
      sale.paymentMethod,
      sale.dueAmount ?? '',
      this.batchNumbers(sale)
    ].join(' ').toLocaleLowerCase().includes(term));
  }

  ngOnInit(): void {
    this.api.getSales().subscribe(s => this.sales = s);
  }

  collectPayment(sale: Sale): void {
    this.dialog.open(CollectPaymentDialogComponent, {
      width: '380px',
      data: { saleId: sale.saleId, paymentMethod: sale.paymentMethod, dueAmount: sale.dueAmount ?? this.netAmount(sale) }
      
    }).afterClosed().subscribe(result => {
      if (!result) return;
      this.api.recordSalePayment(sale.saleId, result.paymentMethod, result.amount).subscribe({
        next: updated => { Object.assign(sale, updated); },
        error: error => this.messageDialog.error(error?.error?.message || 'Could not record payment.')
      });
    });
  }

  voidSale(sale: Sale): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      data: { title: `Void Sale #${sale.saleId}`, fields: [{ key: 'reason', label: 'Reason for voiding', required: true }] },
    }).afterClosed().subscribe(async (result) => {
      const reason = result?.['reason'].trim();
      if (!reason) return;
      if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Void Sale #${sale.saleId}? Stock and the accounting entry will be reversed. This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
      this.api.voidSale(sale.saleId, reason).subscribe({
        next: () => this.sales = this.sales.filter(item => item.saleId !== sale.saleId),
        error: error => this.messageDialog.error(error?.error?.message || 'Could not void the sale.')
      });
    });
  }

  productImageUrl(sale: Sale): string | null {
    return this.api.assetUrl(sale.items?.find(item => item.productImagePath)?.productImagePath);
  }

  /** Distinct batch numbers this invoice drew stock from, for the Batch column. */
  batchNumbers(sale: Sale): string {
    const batches = [...new Set((sale.items || []).map(i => i.batchNumber).filter((b): b is string => !!b))];
    return batches.length ? batches.join(', ') : '-';
  }

  /** Explicit, on-demand print — saving a sale no longer prints automatically. */
  printSale(sale: Sale): void {
    this.salePrint.print(sale);
  }

  isFullyReturned(sale: Sale): boolean {
    return !!sale.hasReturns && (sale.returnedAmount ?? 0) >= sale.totalAmount;
  }

  statusLabel(sale: Sale): string {
    if (sale.hasReturns) return this.isFullyReturned(sale) ? 'Returned' : 'Partially Returned';
    return sale.isPaid ? 'Paid' : 'Due';
  }

  /** What the customer actually owes: subtotal minus discount. */
  netAmount(sale: Sale): number {
    return sale.netAmount ?? sale.totalAmount - (sale.discount ?? 0);
  }
}
