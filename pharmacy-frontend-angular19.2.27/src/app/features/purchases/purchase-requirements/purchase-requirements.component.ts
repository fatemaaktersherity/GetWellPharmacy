import { Component, inject, OnInit } from "@angular/core";
import { CommonModule, DecimalPipe } from "@angular/common";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ApiService } from "../../../core/services/api.service";
import { DailyPurchaseRequirement, Supplier } from "../../../core/models/api.models";

@Component({
    selector: "app-purchase-requirements",
    standalone: true,
    imports: [
        CommonModule,
        DecimalPipe,
        ReactiveFormsModule,
        MatCardModule,
        MatTableModule,
        MatCheckboxModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatSelectModule,
        MatSnackBarModule,
    ],
    templateUrl: "./purchase-requirements.component.html",
    styleUrl: "./purchase-requirements.component.scss",
})
export class PurchaseRequirementsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly snackbar = inject(MatSnackBar);
    private readonly router = inject(Router);

    rows: DailyPurchaseRequirement[] = [];
    suppliers: Supplier[] = [];
    selected = new Set<string>(); // serialNo set
    generating = false;
    converting = false;

    readonly supplierControl = new FormControl<number | null>(null, Validators.required);

    readonly cols = ["select", "productName", "unitName", "stockQty", "requiredQty", "lastPurchaseRate"];

    ngOnInit(): void {
        this.loadRows();
        this.api.getSuppliers().subscribe((s) => (this.suppliers = s));
    }

    loadRows(): void {
        this.api.getDailyPurchaseRequirements().subscribe({
            next: (r) => {
                this.rows = r;
                this.selected.clear();
            },
            error: () =>
                this.snackbar.open("Could not load requirement list.", "Close", { duration: 4000 }),
        });
    }

    generate(): void {
        this.generating = true;
        this.api.generateDailyPurchaseRequirements().subscribe({
            next: (r) => {
                this.rows = r;
                this.selected.clear();
                this.generating = false;
                this.snackbar.open(`${r.length} low-stock product(s) found.`, "Close", { duration: 3000 });
            },
            error: () => {
                this.generating = false;
                this.snackbar.open("Could not generate requirement list.", "Close", { duration: 4000 });
            },
        });
    }

    isSelected(serialNo: string): boolean {
        return this.selected.has(serialNo);
    }

    toggle(serialNo: string, checked: boolean): void {
        if (checked) this.selected.add(serialNo);
        else this.selected.delete(serialNo);
    }

    toggleAll(checked: boolean): void {
        this.selected.clear();
        if (checked) this.rows.forEach((r) => this.selected.add(r.serialNo));
    }

    get allSelected(): boolean {
        return this.rows.length > 0 && this.selected.size === this.rows.length;
    }

    convertToOrder(): void {
        if (this.selected.size === 0) {
            this.snackbar.open("Select at least one product first.", "Close", { duration: 3000 });
            return;
        }
        const supplierId = this.supplierControl.value;
        if (!supplierId) {
            this.snackbar.open("Select a supplier for this order.", "Close", { duration: 3000 });
            return;
        }

        this.converting = true;
        this.api
            .convertRequirementsToOrder({
                serialNos: Array.from(this.selected),
                supplierId,
            })
            .subscribe({
                next: (order) => {
                    this.converting = false;
                    this.snackbar.open(`Purchase order ${order.orderNo} created.`, "Close", { duration: 4000 });
                    this.router.navigate(["/purchase-orders", order.id]);
                },
                error: (e: any) => {
                    this.converting = false;
                    this.snackbar.open(e.error?.message || "Could not create order.", "Close", { duration: 5000 });
                },
            });
    }
}