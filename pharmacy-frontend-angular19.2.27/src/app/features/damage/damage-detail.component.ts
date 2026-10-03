import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { ExpiredProductStockRead } from '../../core/models/api.models';

@Component({
  selector: 'app-damage-detail',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule, MatSnackBarModule],
  template: `<div class="page-header"><div><h1>Damage Report</h1><p>Report details and approval status.</p></div><a mat-stroked-button [routerLink]="backLink"><mat-icon>arrow_back</mat-icon> Back</a></div>
    @if (record; as item) {
      <mat-card><mat-card-content class="details">
        <div><span>Product</span><strong>{{item.productName}}</strong></div>
        <div><span>Batch</span><strong>{{item.batchNumber}}</strong></div>
        <div><span>Warehouse</span><strong>{{item.warehouseName}}</strong></div>
        <div><span>Quantity</span><strong>{{item.quantity}}</strong></div>
        <div><span>Unit Cost</span><strong>{{item.unitCost | currency:'BDT '}}</strong></div>
        <div><span>Write-off Cost</span><strong>{{item.totalCost | currency:'BDT '}}</strong></div>
        <div><span>Reason</span><strong>{{item.note || '—'}}</strong></div>
        <div><span>Requested By</span><strong>{{item.requestedByName}}</strong></div>
        <div><span>Requested</span><strong>{{item.disposalDate | date:'medium'}}</strong></div>
        <div><span>Status</span><strong>{{item.approvalStatus === 'PendingApproval' ? 'Pending Approval' : item.approvalStatus}}</strong></div>
        @if (item.approvedByName) {<div><span>{{item.approvalStatus === 'Rejected' ? 'Reviewed By' : 'Approved By'}}</span><strong>{{item.approvedByName}}</strong></div>}
        @if (item.approvedDate) {<div><span>Reviewed Date</span><strong>{{item.approvedDate | date:'medium'}}</strong></div>}
        @if (item.rejectionReason) {<div><span>Rejection Reason</span><strong>{{item.rejectionReason}}</strong></div>}
      </mat-card-content></mat-card>
    }
  `,
  styles: [`.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.page-header h1{margin:0}.page-header p{margin:5px 0;color:#667}.details{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px}.details div{display:flex;flex-direction:column;gap:6px}.details span{font-size:13px;color:#667}`]
})
export class DamageDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);
  record?: ExpiredProductStockRead;
  backLink = '/damage';

  ngOnInit(): void {
    this.backLink = this.route.snapshot.queryParamMap.get('returnTo') === '/damage/pending-approvals'
      ? '/damage/pending-approvals'
      : '/damage';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getDisposalRecord(id).subscribe({
      next: record => {
        if (record.disposalMethod !== 'Damaged') {
          this.snackbar.open('This record is not a damage report.', 'Close', { duration: 3500 });
          return;
        }
        this.record = record;
      },
      error: () => this.snackbar.open('Could not load damage report.', 'Close', { duration: 4000 })
    });
  }
}
