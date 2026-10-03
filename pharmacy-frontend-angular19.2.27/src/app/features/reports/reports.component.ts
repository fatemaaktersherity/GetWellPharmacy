import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ApiService } from "../../core/services/api.service";
import { ReportPrintService } from "../../core/services/report-print.service";

type ReportKey =
    | "sales"
    | "productSales"
    | "profit"
    | "stockValuation"
    | "expiry"
    | "reorder"
    | "customerDues"
    | "supplierDues"
    | "prescriptionRegister"
    | "purchases"
    | "returns"
    | "expiryLoss";

@Component({
    selector: "app-reports",
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatTableModule,
        MatCheckboxModule,
        MatProgressSpinnerModule,
    ],
    template: `
    <div class="page-header no-print">
      <h1>Reports</h1>
    </div>

    <mat-card class="filters no-print">
      <mat-form-field appearance="outline">
        <mat-label>Report</mat-label>
        <mat-select [(ngModel)]="reportKey">
          @for (r of reportList; track r.key) {
            <mat-option [value]="r.key">{{ r.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline"
        ><mat-label>From</mat-label
        ><input matInput type="date" [(ngModel)]="from"
      /></mat-form-field>
      <mat-form-field appearance="outline"
        ><mat-label>To</mat-label><input matInput type="date" [(ngModel)]="to"
      /></mat-form-field>
      <mat-form-field appearance="outline"
        ><mat-label>Filter ID (optional)</mat-label
        ><input
          matInput
          type="number"
          [(ngModel)]="filterId"
          placeholder="e.g. company / supplier id"
      /></mat-form-field>
      <button
        mat-raised-button
        color="primary"
        (click)="run()"
        [disabled]="loading"
      >
        <mat-icon>play_arrow</mat-icon> Run
      </button>
    </mat-card>

    @if (reportKey === "sales") {
      <mat-card class="quick-range no-print">
        <span class="quick-range-label">Quick range:</span>
        <button mat-stroked-button (click)="setQuickRange('today')">Today</button>
        <button mat-stroked-button (click)="setQuickRange('week')">This Week</button>
        <button mat-stroked-button (click)="setQuickRange('month')">This Month</button>
        <mat-checkbox [(ngModel)]="expiredOnly" (change)="run()">
          Expired product lines only
        </mat-checkbox>
      </mat-card>
    }

    @if (loading) {
      <div class="spinner-wrap"><mat-spinner diameter="36"></mat-spinner></div>
    } @else if (rows().length) {
      <mat-card class="results">
        <div class="results-header">
          <h2>{{ currentLabel() }}</h2>
          <div class="results-meta">
            <span
              >{{ rows().length }} row{{ rows().length === 1 ? "" : "s" }}</span
            >
            <button mat-stroked-button (click)="printReport()" class="no-print">
              <mat-icon>print</mat-icon> Print
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table mat-table [dataSource]="pagedRows()">
            @for (col of cols(); track col) {
              <ng-container [matColumnDef]="col">
                <th mat-header-cell *matHeaderCellDef>
                  {{ formatHeader(col) }}
                </th>
                <td mat-cell *matCellDef="let row">{{ format(row[col]) }}</td>
              </ng-container>
            }
            <tr mat-header-row *matHeaderRowDef="cols()"></tr>
            <tr mat-row *matRowDef="let row; columns: cols()"></tr>
          </table>
        </div>
        <div class="pagination no-print">
          <button
            mat-icon-button
            (click)="previousPage()"
            [disabled]="currentPage === 0"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span>Page {{ currentPage + 1 }} of {{ totalPages }}</span>
          <button
            mat-icon-button
            (click)="nextPage()"
            [disabled]="currentPage >= totalPages - 1"
          >
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
      </mat-card>
    } @else if (ran) {
      <mat-card class="empty-state">
        <mat-icon>inbox</mat-icon>
        <p>No data for the selected filters.</p>
      </mat-card>
    }
  `,
    styles: [
        `
      .page-header { margin-bottom: 16px; }
      .page-header h1 { margin: 0; font-size: 24px; font-weight: 600; }

      .filters {
        display: flex !important;
        flex-direction: row !important;
        gap: 12px;
        flex-wrap: nowrap;
        align-items: flex-start;
        padding: 20px;
        margin-bottom: 16px;
        overflow-x: auto;
      }
      .filters mat-form-field { flex: 1 1 0; min-width: 0; max-width: 220px; }
      .filters ::ng-deep .mat-mdc-form-field-infix { width: auto; min-width: 0; }
      .filters ::ng-deep .mat-mdc-text-field-wrapper { min-width: 0; }
      .filters button { height: 56px; padding: 0 20px; flex: 0 0 auto; white-space: nowrap; align-self: flex-start; }

      .quick-range {
        display: flex !important;
        flex-direction: row !important;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .quick-range-label { font-size: 13px; color: #666; margin-right: 4px; }

      .spinner-wrap { display: flex; justify-content: center; padding: 60px 0; }

      .results { padding: 0; overflow: hidden; }
      .results-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 20px; border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; gap: 12px;
      }
      .results-header h2 { margin: 0; font-size: 18px; font-weight: 600; }
      .results-meta { display: flex; align-items: center; gap: 16px; color: #666; font-size: 14px; }

      .pagination {
        display: flex; align-items: center; justify-content: center; gap: 12px;
        padding: 10px 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666;
      }

      .table-wrap { overflow-x: auto; max-height: 65vh; }
      table { width: 100%; }
      th.mat-mdc-header-cell {
        background: #fafafa; font-weight: 600; position: sticky; top: 0; z-index: 1; white-space: nowrap;
      }
      td.mat-mdc-cell { white-space: nowrap; }
      tr.mat-mdc-row:nth-child(even) { background: #fafafa; }
      tr.mat-mdc-row:hover { background: #f0f0f0; }

      .empty-state {
        display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 0; color: #888;
      }
      .empty-state mat-icon { font-size: 40px; width: 40px; height: 40px; }
    `,
    ],
})
export class ReportsComponent implements OnInit {
    private api = inject(ApiService);
    private reportPrint = inject(ReportPrintService);
    private route = inject(ActivatedRoute);

    reportKey: ReportKey = "sales";
    from = "";
    to = "";
    filterId: number | null = null;
    expiredOnly = false;
    ran = false;
    loading = false;
    private data: any[] = [];

    pageSize = 10;
    currentPage = 0;

    reportList: { key: ReportKey; label: string }[] = [
        { key: "sales", label: "Sales report" },
        { key: "productSales", label: "Product-wise sales" },
        { key: "profit", label: "Profit report" },
        { key: "stockValuation", label: "Stock & valuation" },
        { key: "expiry", label: "Near-expiry / expired stock" },
        { key: "reorder", label: "Low stock / reorder" },
        { key: "customerDues", label: "Customer dues" },
        { key: "supplierDues", label: "Supplier dues" },
        { key: "prescriptionRegister", label: "Prescription / controlled-drug register" },
        { key: "purchases", label: "Purchase report" },
        { key: "returns", label: "Returns report" },
        { key: "expiryLoss", label: "Damage & expiry loss" },
    ];

    ngOnInit(): void {
        const type = this.route.snapshot.queryParamMap.get("type");
        if (type && this.reportList.some((r) => r.key === type)) {
            this.reportKey = type as ReportKey;
            this.run();
        }
    }

    rows() {
        return this.data;
    }
    pagedRows() {
        const start = this.currentPage * this.pageSize;
        return this.data.slice(start, start + this.pageSize);
    }
    get totalPages(): number {
        return Math.max(1, Math.ceil(this.data.length / this.pageSize));
    }
    previousPage(): void {
        if (this.currentPage > 0) this.currentPage--;
    }
    nextPage(): void {
        if (this.currentPage < this.totalPages - 1) this.currentPage++;
    }
    cols() {
        return this.data.length
            ? Object.keys(this.data[0]).filter((k) => typeof this.data[0][k] !== "object")
            : [];
    }
    currentLabel() {
        return this.reportList.find((r) => r.key === this.reportKey)?.label ?? "";
    }

    formatHeader(key: string): string {
        return key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase())
            .trim();
    }
    format(v: any) {
        if (typeof v === "boolean") return v ? "Yes" : "No";
        return typeof v === "number" ? v.toLocaleString() : (v ?? "-");
    }

    /** Daily / weekly / monthly quick presets for the Sales report — sets
     *  From/To (the same fields that also support any custom day-to-day
     *  range, e.g. 2026-09-21 to 2026-12-07) and runs immediately. */
    setQuickRange(preset: "today" | "week" | "month"): void {
        const now = new Date();
        let fromDate: Date;
        if (preset === "today") {
            fromDate = now;
        } else if (preset === "week") {
            fromDate = new Date(now);
            const day = fromDate.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            fromDate.setDate(fromDate.getDate() - diffToMonday);
        } else {
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        this.from = this.toDateInputString(fromDate);
        this.to = this.toDateInputString(now);
        this.run();
    }

    private toDateInputString(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    printReport(): void {
        const subtitleParts: string[] = [];
        if (this.from || this.to) {
            subtitleParts.push(`Range: ${this.from || "…"} to ${this.to || "…"}`);
        }
        if (this.reportKey === "sales" && this.expiredOnly) {
            subtitleParts.push("Expired batch item sales only");
        }
        this.reportPrint.print(
            this.currentLabel(),
            subtitleParts.join(" • "),
            this.cols(),
            this.formatHeader,
            (v) => String(this.format(v)),
            this.rows(),
        );
    }

    run(): void {
        this.loading = true;
        this.ran = true;
        this.currentPage = 0;
        const p = { from: this.from, to: this.to } as any;
        const id = this.filterId ?? undefined;
        const call = {
            sales: () => this.api.getSalesReport({ ...p, expiredOnly: this.expiredOnly }),
            productSales: () => this.api.getProductSalesReport({ ...p, companyId: id }),
            profit: () => this.api.getProfitReport({ ...p, productId: id }),
            stockValuation: () => this.api.getStockValuationReport({ warehouseId: id }),
            expiry: () => this.api.getExpiryReport({ warehouseId: id }),
            reorder: () => this.api.getReorderReport({ companyId: id }),
            customerDues: () => this.api.getCustomerDuesReport({ customerId: id }),
            supplierDues: () => this.api.getSupplierDuesReport({ supplierId: id }),
            prescriptionRegister: () => this.api.getPrescriptionRegister({ ...p, doctorId: id }),
            purchases: () => this.api.getPurchaseReport({ ...p, supplierId: id }),
            returns: () => this.api.getReturnsReport(p),
            expiryLoss: () => this.api.getExpiryLossReport(p),
        }[this.reportKey]();

        call.subscribe({
            next: (res: any) => {
                this.data = Array.isArray(res)
                    ? res
                    : ((Object.values(res).find((v) => Array.isArray(v)) as any[]) ?? []);
                this.loading = false;
            },
            error: () => {
                this.data = [];
                this.loading = false;
            },
        });
    }
}
