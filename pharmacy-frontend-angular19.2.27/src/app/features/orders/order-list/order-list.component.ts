import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatSnackBarModule, RouterLink],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss'
})
export class OrderListComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly snackbar = inject(MatSnackBar);
  orders: any[] = []; ngOnInit(): void { this.load(); }
  load(): void { this.api.getSales().subscribe({ next: (sales) => this.orders = sales.map((s: any) => ({ id: s.saleId, orderNo: 'ORD-' + s.saleId, orderDate: s.saleDate, customerName: s.customerName || 'Walk-in', totalAmount: s.totalAmount, status: s.isPaid ? 'Paid' : 'Pending' })), error: () => this.snackbar.open('Failed', 'Close', { duration: 5000 }) }); }
}
