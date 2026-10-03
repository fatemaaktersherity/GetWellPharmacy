import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PaginationComponent } from '../../shared/pagination/pagination.component';

import {
  PaymentMethod,
  PaymentMethodService,
  PaymentMethodWrite,
} from "./payment-method.service";
import { ApiService } from "../../core/services/api.service";
import { ChartOfAccount } from "../../core/models/api.models";

@Component({
  selector: "app-payment-methods",
  standalone: true,
  imports: [CommonModule, FormsModule, PaginationComponent],
  templateUrl: "./payment-methods.component.html",
  styleUrl: "./payment-methods.component.scss",
})
export class PaymentMethodsComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  paymentMethods: PaymentMethod[] = [];
  ledgerAccounts: ChartOfAccount[] = [];
  pageIndex = 0; pageSize = 10;

  paymentMethod: PaymentMethodWrite = {
    name: "",
    ledgerAccountCode: "",
    isActive: true,
  };

  editingId: number | null = null;

  loading = false;
  errorMessage = "";
  successMessage = "";

  constructor(private paymentMethodService: PaymentMethodService, private api: ApiService) {}

  ngOnInit(): void {
    this.loadPaymentMethods();
    this.api.getChartOfAccounts().subscribe({
      next: accounts => this.ledgerAccounts = accounts.filter(a => a.isActive && a.accountType.toLowerCase() === "asset" && !!a.code),
      error: () => this.errorMessage = "Could not load ledger accounts."
    });
  }

  // =========================
  // GET ALL
  // =========================

  loadPaymentMethods(): void {
    this.loading = true;
    this.errorMessage = "";

    this.paymentMethodService.getAll().subscribe({
      next: (data) => {
        this.paymentMethods = data;
        this.loading = false;
      },

      error: (error) => {
        console.error(error);

        this.errorMessage =
          error.error?.message || "Failed to load payment methods.";

        this.loading = false;
      },
    });
  }

  // =========================
  // CREATE / UPDATE
  // =========================

  savePaymentMethod(): void {
    this.clearMessages();

    if (!this.paymentMethod.name.trim()) {
      this.errorMessage = "Payment method name is required.";

      return;
    }
    if (!this.paymentMethod.ledgerAccountCode) {
      this.errorMessage = "Choose a ledger account so transactions using this method can be posted to the ledger.";
      return;
    }

    // CREATE
    if (this.editingId === null) {
      this.paymentMethodService.create(this.paymentMethod).subscribe({
        next: () => {
          this.successMessage = "Payment method created successfully.";

          this.resetForm();

          this.loadPaymentMethods();
        },

        error: (error) => {
          console.error(error);

          this.errorMessage =
            error.error?.message || "Failed to create payment method.";
        },
      });
    }

    // UPDATE
    else {
      this.paymentMethodService
        .update(this.editingId, this.paymentMethod)
        .subscribe({
          next: () => {
            this.successMessage = "Payment method updated successfully.";

            this.resetForm();

            this.loadPaymentMethods();
          },

          error: (error) => {
            console.error(error);

            this.errorMessage =
              error.error?.message || "Failed to update payment method.";
          },
        });
    }
  }

  // =========================
  // EDIT
  // =========================

  editPaymentMethod(paymentMethod: PaymentMethod): void {
    this.editingId = paymentMethod.id;

    this.paymentMethod = {
      name: paymentMethod.name,

      ledgerAccountCode: paymentMethod.ledgerAccountCode || "",

      isActive: paymentMethod.isActive,
    };

    this.clearMessages();
  }

  // =========================
  // DELETE / DEACTIVATE
  // =========================

  async deletePaymentMethod(id: number) {
    const confirmed = await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: "Are you sure you want to deactivate this payment method?", confirmText: 'Continue', danger: true });

    if (!confirmed) {
      return;
    }

    this.clearMessages();

    this.paymentMethodService.delete(id).subscribe({
      next: () => {
        this.successMessage = "Payment method deactivated successfully.";

        this.loadPaymentMethods();
      },

      error: (error) => {
        console.error(error);

        this.errorMessage =
          error.error?.message || "Failed to deactivate payment method.";
      },
    });
  }

  // =========================
  // CANCEL EDIT
  // =========================

  cancelEdit(): void {
    this.resetForm();

    this.clearMessages();
  }

  // =========================
  // RESET FORM
  // =========================

  resetForm(): void {
    this.editingId = null;

    this.paymentMethod = {
      name: "",

      ledgerAccountCode: "",

      isActive: true,
    };
  }

  // =========================
  // CLEAR MESSAGES
  // =========================

  clearMessages(): void {
    this.errorMessage = "";
    this.successMessage = "";
  }
}
