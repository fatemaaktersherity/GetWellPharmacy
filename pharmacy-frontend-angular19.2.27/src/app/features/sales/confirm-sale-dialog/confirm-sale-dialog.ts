import { Component, inject, signal } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { PaymentMethod } from "../../payment-methods/payment-method.service";

export interface ConfirmSaleDialogItem {
    productName: string;
    batchNumber?: string;
    unitName?: string;
    quantity: number;
    unitPrice: number;
}

export interface ConfirmSaleDialogData {
    paymentMethods: PaymentMethod[];
    /** Pre-selected method (the dialog is now the ONLY place it is chosen). */
    paymentMethod: string;
    subtotal: number;
    /** False for a walk-in sale — walk-in sales cannot be left due. */
    customerSelected: boolean;
    items: ConfirmSaleDialogItem[];
}

export interface ConfirmSaleResult {
    paymentMethod: string;
    isPaid: boolean;
    discount: number;
    /** Paid  -> cash received (>= total due).
     *  Due   -> advance / partial payment taken now (0 = nothing yet). */
    amountPaid: number;
    termsAndConditions?: string;
    printWindow?: Window | null;
}

/** Money math on 2 decimals so 14.000000001 >= 14 never flips a sale's status. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Component({
    selector: "app-confirm-sale-dialog",
    standalone: true,
    imports: [
        CurrencyPipe,
        ReactiveFormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
    ],
    templateUrl: "./confirm-sale-dialog.html",
    styleUrl: "./confirm-sale-dialog.scss",
})
export class ConfirmSaleDialogComponent {
    private readonly fb = inject(FormBuilder);
    private readonly dialogRef = inject(
        MatDialogRef<ConfirmSaleDialogComponent, ConfirmSaleResult>,
    );
    readonly data = inject<ConfirmSaleDialogData>(MAT_DIALOG_DATA);
    readonly ready = signal(false);

    readonly form = this.fb.nonNullable.group({
        paymentMethod: [this.data.paymentMethod, Validators.required],
        isPaid: [true, Validators.required],
        discount: [0, [Validators.min(0)]],
        amountPaid: [this.data.subtotal, [Validators.min(0)]],
        termsAndConditions: ["", Validators.maxLength(500)],
    });

    constructor() {
        // Paid: "amount received" follows the total due as the discount is typed.
        // Due:  the cashier's advance/partial amount is left alone.
        this.form.controls.discount.valueChanges.subscribe(() => {
            if (this.isPaid) {
                this.form.controls.amountPaid.setValue(this.totalDue, {
                    emitEvent: false,
                });
            }
        });

        // (unchanged) wait for the open animation so the outline notch is measured correctly.
        this.dialogRef.afterOpened().subscribe(() => {
            this.ready.set(true);
        });
    }

    get items(): ConfirmSaleDialogItem[] {
        return this.data.items ?? [];
    }
    get subtotal(): number {
        return this.data.subtotal;
    }
    get discount(): number {
        return this.form.controls.discount.value || 0;
    }
    get totalDue(): number {
        return round2(Math.max(this.subtotal - this.discount, 0));
    }
    get amountPaid(): number {
        return this.form.controls.amountPaid.value || 0;
    }
    /** Cash handed back — only meaningful for a Paid sale. */
    get change(): number {
        return this.isPaid ? round2(Math.max(this.amountPaid - this.totalDue, 0)) : 0;
    }
    /** What is still owed after the advance — only meaningful for a Due sale. */
    get balanceDue(): number {
        return this.isPaid ? 0 : round2(Math.max(this.totalDue - this.amountPaid, 0));
    }
    get isPaid(): boolean {
        return this.form.controls.isPaid.value;
    }

    /** First problem that should block Save, or null when the sale is good to go. */
    get error(): string | null {
        if (this.discount > this.subtotal) {
            return "Discount cannot be more than the subtotal.";
        }
        if (this.isPaid) {
            if (round2(this.amountPaid) < this.totalDue) {
                return "Amount received is less than the total due. Choose “Unpaid / Due” to record a partial payment.";
            }
            return null;
        }
        if (!this.data.customerSelected) {
            return "Select a customer on the checkout panel first — walk-in sales must be paid immediately.";
        }
        if (round2(this.amountPaid) >= this.totalDue) {
            return "This amount covers the full total. Choose “Paid” instead, or enter a smaller advance.";
        }
        return null;
    }

    setStatus(paid: boolean): void {
        this.form.controls.isPaid.setValue(paid);
        // Paid -> full amount. Due -> nothing collected yet (a stale "full
        // amount" left in the box is exactly what used to flip Due sales to Paid).
        this.form.controls.amountPaid.setValue(paid ? this.totalDue : 0);
    }

    back(): void {
        this.dialogRef.close();
    }

    save(): void {
        if (this.form.invalid || this.error) return;
        const value = this.form.getRawValue();
        // Open the print tab directly from the user's Save click so the
        // browser does not block it while the sale request is in flight.
        const printWindow = window.open("", "_blank");
        this.dialogRef.close({
            paymentMethod: value.paymentMethod,
            isPaid: value.isPaid,
            discount: value.discount || 0,
            amountPaid: value.isPaid ? this.totalDue : value.amountPaid || 0,
            termsAndConditions: value.isPaid ? undefined : value.termsAndConditions.trim() || undefined,
            printWindow,
        } as ConfirmSaleResult);
    }
}
