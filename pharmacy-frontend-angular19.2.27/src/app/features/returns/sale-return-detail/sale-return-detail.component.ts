import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { SaleReturn } from '../../../core/models/api.models';
import { SaleReturnPrintService } from '../../../core/services/sale-return-print.service';
import { PaymentMethod, PaymentMethodService } from '../../payment-methods/payment-method.service';

@Component({
  selector: 'app-sale-return-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule],
  template: `
    <mat-card *ngIf="ret">
      <mat-card-header>
        <mat-card-title>Sale Return {{ ret.returnNo }}</mat-card-title>
        <mat-card-subtitle>From Sale #{{ ret.saleId }} — {{ ret.returnDate | date }}</mat-card-subtitle>
        <div class="header-actions" *ngIf="ret">
          <button mat-stroked-button type="button" (click)="printReturn()"><mat-icon>print</mat-icon> Print</button>
        </div>
      </mat-card-header>
      <mat-card-content *ngIf="ret">
        <p *ngIf="ret.reason"><b>Reason:</b> {{ ret.reason }}</p>
        <p *ngIf="ret.isDeleted" class="deleted-note">This return has been deleted.</p>

        <h4>Items</h4>
        <p class="hint">Items are fixed once a return is created. Returns with a paid refund are kept for the audit trail and cannot be deleted.</p>
        <table class="items-table return-items-table">
          <thead><tr><th>Product</th><th>Unit</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead>
          <tbody>
            <tr *ngFor="let i of ret.items">
              <td>{{ i.medicineName || ('Product #' + i.medicineId) }}</td>
              <td>{{ i.unitName || '-' }}</td>
              <td class="num">{{ i.quantity }}</td>
              <td class="num">{{ i.salesPrice | number:'1.2-2' }}</td>
              <td class="num">{{ i.subTotal | number:'1.2-2' }}</td>
            </tr>
            <tr *ngIf="!ret.items?.length">
              <td colspan="5" class="hint">No item details were saved for this return.</td>
            </tr>
          </tbody>
        </table>

        <div class="summary">
          <div><span>Return Total</span><b>{{ ret.returnTotal | number:'1.2-2' }}</b></div>
          <div><span>Applied to outstanding due</span><b>{{ ret.appliedToDue | number:'1.2-2' }}</b></div>
          <div><span>Refunded</span><b>{{ ret.refundedAmount | number:'1.2-2' }}</b></div>
          <div><span>Remaining Customer Credit</span><b>{{ ret.customerCredit | number:'1.2-2' }}</b></div>
        </div>

        <h4>Refund History</h4>
        <table class="items-table" *ngIf="ret.refunds.length; else noRefunds">
          <thead><tr><th>Date</th><th class="num">Amount</th><th>Method</th><th>Note</th></tr></thead>
          <tbody>
            <tr *ngFor="let refund of ret.refunds">
              <td>{{ refund.refundedAt | date:'medium' }}</td>
              <td class="num">{{ refund.amount | number:'1.2-2' }}</td>
              <td>{{ refund.paymentMethod }}</td>
              <td>{{ refund.note || '-' }}</td>
            </tr>
          </tbody>
        </table>
        <ng-template #noRefunds><p class="hint">No refunds recorded.</p></ng-template>

        <ng-container *ngIf="!ret.isDeleted && ret.customerCredit > 0">
          <h4>Record Refund</h4>
          <mat-form-field appearance="outline"><mat-label>Amount</mat-label>
            <input matInput type="number" min="0.01" [max]="ret.customerCredit" [(ngModel)]="refundAmount" name="refundAmount">
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Method</mat-label>
            <mat-select [(ngModel)]="refundMethod" name="refundMethod">
              <mat-option *ngFor="let method of paymentMethods" [value]="method.name">{{ method.name }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Note</mat-label><input matInput [(ngModel)]="refundNote" name="refundNote"></mat-form-field>
          <button mat-flat-button color="primary" [disabled]="refunding || !refundAmount" (click)="recordRefund()">
            {{ refunding ? 'Saving…' : 'Record Refund' }}
          </button>
        </ng-container>

        <h4>Receipt</h4>
        <a class="receipt-preview-link" *ngIf="receiptUrl(ret) as url" [href]="url" target="_blank" aria-label="Open receipt image in a new tab">
          <img class="receipt-preview" [src]="url" alt="Sale return receipt">
        </a>
        <div class="receipt-actions">
          <input type="file" accept="image/*" (change)="selectReceipt($event)">
          <span class="selected-file" *ngIf="receiptFile">{{ receiptFile.name }}</span>
          <button mat-flat-button color="primary" class="receipt-button" type="button" [disabled]="!receiptFile || savingReceipt" (click)="saveReceipt()">
            {{ savingReceipt ? 'Saving…' : 'Save Receipt' }}
          </button>
        </div>

        <p class="error" *ngIf="error">{{ error }}</p>
      </mat-card-content>
      <mat-card-actions>
        <a mat-button routerLink="/returns/sale">Back</a>
        <button mat-button color="warn" *ngIf="ret && !ret.isDeleted && ret.refundedAmount === 0" (click)="deleteReturn()">Delete Return</button>
        <span class="hint" *ngIf="ret && ret.refundedAmount > 0">This return cannot be deleted because a refund has been paid.</span>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    mat-form-field { display:inline-block; width:200px; margin-right:12px; }
    .items-table { width:100%; border-collapse:collapse; margin:8px 0 16px; }
    .items-table th, .items-table td { text-align:left; padding:6px 8px; border-bottom:1px solid #ddd; }
    .return-items-table th, .return-items-table td { border-bottom:0; }
    .num { text-align:right; }
    .summary { display:flex; gap:24px; margin:12px 0; padding:12px 0; border-top:1px solid #ddd; border-bottom:1px solid #ddd; }
    .summary div { display:flex; flex-direction:column; }
    .summary span { color:#666; font-size:12px; }
    .hint { color:#666; font-size:13px; }
    .deleted-note { color:#b00020; }
    .error { color:#b00020; }
    mat-card-header { display:flex; align-items:flex-start; gap:16px; }
    .header-actions { margin-left:auto; }
    .header-actions button mat-icon { margin-right:4px; }
    .receipt-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
    .receipt-button { min-width:0; height:34px; min-height:34px; margin-left:-90px; padding:0 12px; font-size:12px; line-height:32px; }
    .selected-file { color:#667085; font-size:13px; }
    .receipt-preview-link { display:inline-block; margin:0 0 14px; }
    .receipt-preview { display:block; width:240px; height:160px; max-width:100%; object-fit:contain; border:1px solid #dfe6e6; border-radius:10px; background:#f8fafc; }
  `],
})
export class SaleReturnDetailComponent {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly printService = inject(SaleReturnPrintService);
  private readonly paymentMethodService = inject(PaymentMethodService);

  ret?: SaleReturn;
  refundAmount?: number;
  refundMethod = 'Cash';
  paymentMethods: PaymentMethod[] = [];
  refundNote = '';
  refunding = false;
  receiptFile?: File;
  savingReceipt = false;
  private receiptInput?: HTMLInputElement;
  error = '';

  constructor() {
    this.paymentMethodService.getAll().subscribe(methods => {
      this.paymentMethods = methods.filter(method => method.isActive);
      if (!this.paymentMethods.some(method => method.name === this.refundMethod) && this.paymentMethods.length) this.refundMethod = this.paymentMethods[0].name;
    });
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  private load(id: number): void {
    this.api.getSaleReturn(id).subscribe({
      next: (r) => (this.ret = r),
      error: () => (this.error = 'Could not load this sale return.'),
    });
  }

  receiptUrl(ret: SaleReturn): string | null {
    const pathUrl = this.api.assetUrl(ret.receiptImagePath);
    if (pathUrl) return pathUrl;
    if (!ret.receiptImage) return null;
    return `data:${ret.receiptImageContentType || 'image/jpeg'};base64,${ret.receiptImage}`;
  }

  recordRefund(): void {
    if (!this.ret || !this.refundAmount) return;
    this.refunding = true;
    this.api.refundSaleReturn(this.ret.id, { amount: this.refundAmount, paymentMethod: this.refundMethod, note: this.refundNote || undefined }).subscribe({
      next: () => {
        this.refunding = false;
        this.refundAmount = undefined;
        this.refundNote = '';
        this.load(this.ret!.id);
      },
      error: (e) => {
        this.refunding = false;
        this.error = e?.error?.message || 'Could not record the refund.';
      },
    });
  }

  selectReceipt(event: Event): void {
    this.receiptInput = event.target as HTMLInputElement;
    this.receiptFile = this.receiptInput.files?.[0];
    this.error = '';
  }

  printReturn(): void {
    if (this.ret) this.printService.print(this.ret);
  }

  saveReceipt(): void {
    if (!this.ret || !this.receiptFile || this.savingReceipt) return;
    this.savingReceipt = true;
    this.error = '';
    this.api.uploadSaleReturnReceipt(this.ret.id, this.receiptFile).subscribe({
      next: () => {
        this.savingReceipt = false;
        this.receiptFile = undefined;
        if (this.receiptInput) this.receiptInput.value = '';
        this.load(this.ret!.id);
      },
      error: (e) => {
        this.savingReceipt = false;
        this.error = e?.error?.message || 'Could not upload the receipt.';
      },
    });
  }

  async deleteReturn() {
    if (!this.ret || !await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete return ${this.ret.returnNo}? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteSaleReturn(this.ret.id).subscribe({
      next: () => this.router.navigate(['/returns/sale']),
      error: (e) => (this.error = e?.error?.message || 'Could not delete this return.'),
    });
  }
}
