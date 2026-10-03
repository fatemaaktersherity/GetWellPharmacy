import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';
@Component({
  selector: 'app-customer-order-history',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatSnackBarModule, RouterLink],
  templateUrl: './customer-order-history.component.html',
  styleUrl: './customer-order-history.component.scss'
})
export class CustomerOrderHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute); private readonly api = inject(ApiService); private readonly snackbar = inject(MatSnackBar);
  customerId!: number; customer?: any; sales: any[] = [];
  ngOnInit(): void { const id = this.route.snapshot.paramMap.get('id'); if (!id) return; this.customerId = Number(id); this.loadCustomer(); this.loadHistory(); }
  loadCustomer(): void { this.api.getCustomer(this.customerId).subscribe({ next: (c) => this.customer = c, error: () => this.snackbar.open('Failed', 'Close', { duration: 5000 }) }); }
  loadHistory(): void { this.api.getSales().subscribe({ next: (salesList) => this.sales = salesList.filter((s: any) => s.customerId === this.customerId), error: () => this.snackbar.open('Failed', 'Close', { duration: 5000 }) }); }
}
