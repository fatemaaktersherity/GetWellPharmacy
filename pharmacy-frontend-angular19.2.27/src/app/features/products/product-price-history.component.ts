import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/services/api.service';
import { ProductPriceHistory } from '../../core/models/api.models';

@Component({ selector: 'app-product-price-history', standalone: true,
  imports: [RouterLink, CurrencyPipe, DatePipe, MatButtonModule, MatCardModule, MatIconModule, MatTableModule],
  template: `<div class="page-header"><div><h1>Price History</h1><p>Immutable record of product and packaging price changes.</p></div><a mat-button routerLink="/products"><mat-icon>arrow_back</mat-icon> Products</a></div><mat-card><mat-card-content><table mat-table [dataSource]="history"><ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>Date</th><td mat-cell *matCellDef="let h">{{h.changedAt | date:'medium'}}</td></ng-container><ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>Price</th><td mat-cell *matCellDef="let h">{{h.priceType}}{{h.unitName ? ' — ' + h.unitName : ''}}</td></ng-container><ng-container matColumnDef="previous"><th mat-header-cell *matHeaderCellDef>Previous</th><td mat-cell *matCellDef="let h">{{h.previousPrice == null ? 'Initial' : (h.previousPrice | currency:'BDT ')}}</td></ng-container><ng-container matColumnDef="new"><th mat-header-cell *matHeaderCellDef>New</th><td mat-cell *matCellDef="let h">{{h.newPrice | currency:'BDT '}}</td></ng-container><ng-container matColumnDef="quantity"><th mat-header-cell *matHeaderCellDef>Base Qty</th><td mat-cell *matCellDef="let h">{{h.newBaseQuantity || '-'}}</td></ng-container><tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr></table>@if (!history.length) { <p class="empty">No price changes recorded yet.</p> }</mat-card-content></mat-card>`,
  styles: ['.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.page-header h1{margin:0}.page-header p,.empty{color:#666}table{width:100%}'] })
export class ProductPriceHistoryComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly route = inject(ActivatedRoute);
  history: ProductPriceHistory[] = []; columns = ['date','type','previous','new','quantity'];
  ngOnInit(): void { this.api.getProductPriceHistory(Number(this.route.snapshot.paramMap.get('id'))).subscribe(rows => this.history = rows); }
}
