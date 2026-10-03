import { Component, DestroyRef, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { interval } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { ApiService } from "../../core/services/api.service";
import {
  Product,
  PaymentMethod,
  ProductStock,
  PurchaseInvoice,
  Sale,
  SaleReturn,
} from "../../core/models/api.models";

interface TrendPoint {
  date: Date;
  dateLabel: string;
  sales: number;
  purchases: number;
  x: number;
  salesY: number;
  purchasesY: number;
}

interface ChartTick {
  y: number;
  label: string;
}

interface PaymentSlice {
  method: string;
  count: number;
  percent: number;
  color: string;
}

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.scss",
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  recentSales: Sale[] = [];
  private sales: Sale[] = [];
  private purchases: PurchaseInvoice[] = [];
  private saleReturns: SaleReturn[] = [];
  private paymentMethods: PaymentMethod[] = [];
  private readonly chartColors = ["#087d72", "#5274cf", "#e2a33a", "#9b70c8", "#df6b70", "#4d9ca8"];
  lowStockProducts: Product[] = [];
  readonly salesSearchControl = new FormControl("", { nonNullable: true });

  get filteredRecentSales(): Sale[] {
    const term = this.salesSearchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.recentSales;
    return this.recentSales.filter((s) =>
      [s.saleId, s.customerName || "Walk-in customer"]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }

  todaySales = 0;
  todayPurchase = 0;
  totalStockValue = 0;
  pendingPurchaseAmount = 0;
  nearExpiryBatches = 0;
  expiredBatches = 0;
  loading = true;
  lastUpdated?: Date;
  errors: string[] = [];

  ngOnInit(): void {
    this.refresh();
    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.loading) this.refresh();
      });
  }

  refresh(): void {
    this.loading = true;
    this.errors = [];
    let pending = 8;
    const finish = () => {
      if (--pending === 0) {
        this.loading = false;
        this.lastUpdated = new Date();
      }
    };
    const failed = (message: string) => {
      this.errors.push(message);
      finish();
    };

    this.api.getProductStocks().subscribe({
      next: (stocks) => {
        this.totalStockValue = this.stockValue(stocks);
        finish();
      },
      error: () => failed("Stock value could not be loaded."),
    });

    this.api.getExpiredProductStocks().subscribe({
      next: (stocks) => {
        this.expiredBatches = stocks.length;
        finish();
      },
      error: () => failed("Expired batches could not be loaded."),
    });

    this.api.getNearExpiryStocks(30).subscribe({
      next: (stocks) => {
        this.nearExpiryBatches = stocks.length;
        finish();
      },
      error: () => failed("Near-expiry batches could not be loaded."),
    });

    this.api.getSales().subscribe({
      next: (sales) => {
        this.sales = sales;
        this.todaySales = sales
          .filter((s) => this.isToday(s.saleDate))
          .reduce((sum, s) => sum + s.totalAmount, 0);
        this.recentSales = [...sales]
          .sort(
            (a, b) =>
              new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime(),
          )
          .slice(0, 6);
        finish();
      },
      error: () => failed("Sales could not be loaded."),
    });

    this.api.getPaymentMethods().subscribe({
      next: (methods) => {
        this.paymentMethods = methods;
        finish();
      },
      error: () => failed("Payment methods could not be loaded for the chart."),
    });

    this.api.getPurchaseInvoices().subscribe({
      next: (purchases) => {
        this.purchases = purchases;
        this.todayPurchase = purchases
          .filter((p) => this.isToday(p.purchaseDate))
          .reduce((sum, p) => sum + p.total, 0);
        this.pendingPurchaseAmount = purchases.reduce(
          (sum, p) => sum + Math.max(0, p.due || 0),
          0,
        );
        finish();
      },
      error: () => failed("Purchases could not be loaded."),
    });

    this.api.getSaleReturns().subscribe({
      next: (returns) => {
        this.saleReturns = returns;
        finish();
      },
      error: () => failed("Sale returns could not be loaded for the chart."),
    });

    this.api.getLowStockProducts().subscribe({
      next: (products) => {
        this.lowStockProducts = products;
        finish();
      },
      error: () => failed("Low stock products could not be loaded."),
    });
  }

  get trendPoints(): TrendPoint[] {
    const days: { date: Date; sales: number; purchases: number }[] = [];
    const byDay = new Map<string, { sales: number; purchases: number }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = 29; offset >= 0; offset--) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = this.dateKey(date);
      byDay.set(key, { sales: 0, purchases: 0 });
      days.push({ date, sales: 0, purchases: 0 });
    }

    for (const sale of this.sales) {
      if (sale.isVoided) continue;
      const day = byDay.get(this.dateKey(new Date(sale.saleDate)));
      if (day) day.sales += sale.netAmount ?? (sale.totalAmount - (sale.discount ?? 0));
    }
    for (const invoice of this.purchases) {
      const day = byDay.get(this.dateKey(new Date(invoice.purchaseDate)));
      if (day) day.purchases += invoice.total;
    }
    for (const saleReturn of this.saleReturns) {
      if (saleReturn.isDeleted) continue;
      const day = byDay.get(this.dateKey(new Date(saleReturn.returnDate)));
      if (day) day.sales -= saleReturn.returnTotal;
    }

    const amounts = [...byDay.values()].flatMap((day) => [day.sales, day.purchases]);
    const max = Math.max(1, ...amounts);
    const min = Math.min(0, ...amounts);
    const range = max - min || 1;
    const plotLeft = 64;
    const plotWidth = 650;
    const plotTop = 18;
    const plotHeight = 210;

    return days.map(({ date }) => {
      const values = byDay.get(this.dateKey(date))!;
      const index = days.findIndex((day) => this.dateKey(day.date) === this.dateKey(date));
      return {
        date,
        dateLabel: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
        sales: values.sales,
        purchases: values.purchases,
        x: plotLeft + (index / 29) * plotWidth,
        salesY: plotTop + ((max - values.sales) / range) * plotHeight,
        purchasesY: plotTop + ((max - values.purchases) / range) * plotHeight,
      };
    });
  }

  get trendTicks(): ChartTick[] {
    const points = this.trendPoints;
    const values = points.flatMap((point) => [point.sales, point.purchases]);
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    return [0, 1, 2, 3, 4].map((step) => {
      const value = max - (range * step) / 4;
      return {
        y: 18 + (210 * step) / 4,
        label: this.compactAmount(value),
      };
    });
  }

  get salesLine(): string {
    return this.trendPoints.map((point) => `${point.x},${point.salesY}`).join(" ");
  }

  get purchasesLine(): string {
    return this.trendPoints.map((point) => `${point.x},${point.purchasesY}`).join(" ");
  }

  get paymentSlices(): PaymentSlice[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);
    const counts = new Map<string, { method: string; count: number }>();
    for (const method of this.paymentMethods.filter((item) => item.isActive)) {
      counts.set(method.name.trim().toLocaleLowerCase(), { method: method.name.trim(), count: 0 });
    }
    for (const sale of this.sales) {
      if (sale.isVoided || new Date(sale.saleDate) < start) continue;
      const method = sale.paymentMethod?.trim() || "Unspecified";
      const key = method.toLocaleLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { method, count: 1 });
    }
    const total = [...counts.values()].reduce((sum, item) => sum + item.count, 0);
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method))
      .map(({ method, count }, index) => ({
        method,
        count,
        percent: total ? (count / total) * 100 : 0,
        color: this.chartColors[index % this.chartColors.length],
      }));
  }

  get paymentPieGradient(): string {
    const slices = this.paymentSlices;
    if (!slices.length) return "conic-gradient(#e6efed 0 100%)";
    let cursor = 0;
    const stops = slices.map((slice) => {
      const start = cursor;
      cursor += slice.percent;
      return `${slice.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }

  get paymentSaleCount(): number {
    return this.paymentSlices.reduce((sum, slice) => sum + slice.count, 0);
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private compactAmount(value: number): string {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  // Mirrors sale-list.component.ts: a sale that has been returned should
  // show its return status here too, not just its payment status, so the
  // dashboard doesn't disagree with the Sales list / sale detail page.
  isFullyReturned(sale: Sale): boolean {
    return !!sale.hasReturns && (sale.returnedAmount ?? 0) >= sale.totalAmount;
  }

  statusLabel(sale: Sale): string {
    if (sale.hasReturns) return this.isFullyReturned(sale) ? 'Returned' : 'Partially Returned';
    return sale.isPaid ? 'Paid' : 'Due';
  }

  private isToday(value: string): boolean {
    return new Date(value).toDateString() === new Date().toDateString();
  }

  private stockValue(stocks: ProductStock[]): number {
    return stocks.reduce(
      (sum, stock) => sum + stock.quantity * stock.unitCost,
      0,
    );
  }
}
