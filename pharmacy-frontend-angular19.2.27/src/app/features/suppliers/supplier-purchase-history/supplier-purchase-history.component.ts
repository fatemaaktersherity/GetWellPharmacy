import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { ApiService } from '../../../core/services/api.service';
import { Supplier, PurchaseInvoice } from '../../../core/models/api.models';

@Component({
    selector: 'app-supplier-purchase-history',
    standalone: true,
    imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatExpansionModule],
    templateUrl: './supplier-purchase-history.component.html',
    styleUrl: './supplier-purchase-history.component.scss'
})
export class SupplierPurchaseHistoryComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);

    supplierId = 0;
    supplier: Supplier | null = null;
    invoices: PurchaseInvoice[] = [];

    get totalPurchased(): number {
        return this.invoices.reduce((sum, i) => sum + i.total, 0);
    }
    get totalDue(): number {
        return this.invoices.reduce((sum, i) => sum + Math.max(0, i.due || 0), 0);
    }

    ngOnInit(): void {
        this.supplierId = Number(this.route.snapshot.paramMap.get('id'));
        this.api.getSupplier(this.supplierId).subscribe(s => this.supplier = s);
        this.load();
    }

    load(): void {
        this.api.getPurchaseInvoices(this.supplierId).subscribe(invoices => this.invoices = invoices);
    }

    receiptUrl(path?: string): string | null { return this.api.assetUrl(path); }
}