import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe, SlicePipe } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatTabsModule } from "@angular/material/tabs";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AuthService } from "../../../core/services/auth.service";
import { AssetFormDialogComponent } from "../asset-form-dialog/asset-form-dialog.component";
import { LiabilityFormDialogComponent } from "../liability-form-dialog/liability-form-dialog.component";
import { JournalEntryDialogComponent } from "../journal-entry-dialog/journal-entry-dialog.component";
import { InputPromptDialogComponent } from "../../../shared/input-prompt-dialog/input-prompt-dialog.component";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ReactiveFormsModule, FormControl } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { ApiService } from "../../../core/services/api.service";
import {
  ChartOfAccount,
  CompanyAsset,
  CompanyLiability,
  LedgerAccount,
  LIABILITY_TYPES,
} from "../../../core/models/api.models";

@Component({
  selector: "app-ledger",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    SlicePipe,
    PaginationComponent,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatTabsModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./ledger.component.html",
  styleUrl: "./ledger.component.scss",
})
export class LedgerComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  selectedTab = 0;
  chartOfAccounts: ChartOfAccount[] = [];
  companyAssets: CompanyAsset[] = [];
  companyLiabilities: CompanyLiability[] = [];
  ledgerAccounts: LedgerAccount[] = [];
  accountsPageIndex = 0; assetsPageIndex = 0; liabilitiesPageIndex = 0; ledgerPageIndex = 0;
  accountsPageSize = 10; assetsPageSize = 10; liabilitiesPageSize = 10; ledgerPageSize = 10;

  readonly accountSearchControl = new FormControl("", { nonNullable: true });
  readonly ledgerSearchControl = new FormControl("", { nonNullable: true });

  get filteredChartOfAccounts(): ChartOfAccount[] {
    const term = this.accountSearchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.chartOfAccounts;
    return this.chartOfAccounts.filter(
      (a) =>
        a.name?.toLocaleLowerCase().includes(term) ||
        a.code?.toLocaleLowerCase().includes(term),
    );
  }

  get filteredLedgerAccounts(): LedgerAccount[] {
    const term = this.ledgerSearchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.ledgerAccounts;
    return this.ledgerAccounts.filter(
      (l) =>
        l.chartOfAccountName?.toLocaleLowerCase().includes(term) ||
        l.voucherNo?.toLocaleLowerCase().includes(term) ||
        l.description?.toLocaleLowerCase().includes(term),
    );
  }

  liabilityTypeLabel(type?: number): string {
    return LIABILITY_TYPES.find((t) => t.value === type)?.label ?? "-";
  }

  ngOnInit(): void {
    this.loadAccounts();
    this.loadAssets();
    this.loadLiabilities();
    this.loadLedger();
  }

  loadAssets(): void {
    this.api.getCompanyAssets().subscribe((a) => (this.companyAssets = a));
  }
  loadLiabilities(): void {
    this.api
      .getCompanyLiabilities()
      .subscribe((l) => (this.companyLiabilities = l));
  }
  loadLedger(): void {
    this.api.getLedgerAccounts().subscribe((l) => (this.ledgerAccounts = l));
  }
  loadAccounts(): void {
    this.api.getChartOfAccounts().subscribe((a) => (this.chartOfAccounts = a));
  }

  addAccount(): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(460px, calc(100vw - 32px))",
      data: {
        title: "Add Account",
        fields: [
          { key: "name", label: "Account name", required: true },
          { key: "code", label: "Account code" },
          { key: "accountType", label: "Account type", value: "Asset", required: true, options: ["Asset", "Liability", "Revenue", "Expense", "Equity"] },
        ],
      },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.api.createChartOfAccount({
        name: result["name"].trim(),
        code: result["code"].trim() || undefined,
        accountType: result["accountType"],
        isActive: true,
      }).subscribe({
        next: () => { this.snackbar.open("Account added", "Close", { duration: 3000 }); this.loadAccounts(); },
        error: (e: any) => this.snackbar.open(e.error?.message || "Could not add account.", "Close", { duration: 5000 }),
      });
    });
  }

  editAccount(a: ChartOfAccount): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(420px, calc(100vw - 32px))",
      data: { title: "Edit Account", fields: [{ key: "name", label: "Account name", value: a.name, required: true }] },
    }).afterClosed().subscribe((result) => {
      const name = result?.["name"].trim();
      if (!name) return;
      this.api.updateChartOfAccount(a.id, {
        name,
        code: a.code,
        accountType: a.accountType,
        parentId: a.parentId,
        isActive: a.isActive,
      }).subscribe({
        next: () => { this.snackbar.open("Account updated", "Close", { duration: 3000 }); this.loadAccounts(); },
        error: (e: any) => this.snackbar.open(e.error?.message || "Could not update account.", "Close", { duration: 5000 }),
      });
    });
  }

  async deleteAccount(a: ChartOfAccount) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete ${a.name}?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteChartOfAccount(a.id).subscribe({
      next: () => {
        this.snackbar.open("Account deleted", "Close", { duration: 3000 });
        this.loadAccounts();
      },
      error: (e: any) =>
        this.snackbar.open(
          e.error?.message || "Could not delete account.",
          "Close",
          { duration: 5000 },
        ),
    });
  }

  private showError(fallback: string) {
    return (e: any) =>
      this.snackbar.open(e.error?.message || fallback, "Close", {
        duration: 5000,
      });
  }

  addAsset(): void {
    this.dialog
      .open(AssetFormDialogComponent, { width: "520px" })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.api.createCompanyAsset(result).subscribe({
          next: () => {
            this.snackbar.open("Asset added", "Close", { duration: 3000 });
            this.loadAssets();
          },
          error: this.showError("Could not add asset."),
        });
      });
  }

  async depreciateAsset(a: CompanyAsset) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Run one depreciation period for "${a.name}"?`, confirmText: 'Continue', danger: true })) return;
    this.api.depreciateCompanyAsset(a.id).subscribe({
      next: () => {
        this.snackbar.open("Depreciation posted", "Close", { duration: 3000 });
        this.loadAssets();
      },
      error: this.showError("Could not depreciate asset."),
    });
  }

  async disposeAsset(a: CompanyAsset) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Mark "${a.name}" as disposed? This cannot be undone.`, confirmText: 'Continue', danger: true }))
      return;
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(420px, calc(100vw - 32px))",
      data: { title: `Dispose ${a.name}`, fields: [{ key: "date", label: "Disposal date (blank for today)", type: "date" }] },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.api.disposeCompanyAsset(a.id, result["date"] || undefined).subscribe({
        next: () => { this.snackbar.open("Asset disposed", "Close", { duration: 3000 }); this.loadAssets(); },
        error: this.showError("Could not dispose asset."),
      });
    });
  }

  editAsset(a: CompanyAsset): void {
    this.api.getCompanyAsset(a.id).subscribe({
      next: (detail) => {
        this.dialog.open(AssetFormDialogComponent, { width: "520px", data: { asset: detail } })
          .afterClosed().subscribe((result) => {
            if (!result) return;
            this.api.updateCompanyAsset(a.id, result).subscribe({
              next: () => { this.snackbar.open("Asset updated", "Close", { duration: 3000 }); this.loadAssets(); },
              error: this.showError("Could not update asset."),
            });
          });
      },
      error: this.showError("Could not load asset details."),
    });
  }
  async deleteAssetRow(a: CompanyAsset) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete asset "${a.name}"? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteCompanyAsset(a.id).subscribe({
      next: () => { this.snackbar.open("Asset deleted", "Close", { duration: 3000 }); this.loadAssets(); },
      error: this.showError("Could not delete asset."),
    });
  }

  addLiability(): void {
    this.dialog
      .open(LiabilityFormDialogComponent, { width: "520px" })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.api.createCompanyLiability(result).subscribe({
          next: () => {
            this.snackbar.open("Liability added", "Close", { duration: 3000 });
            this.loadLiabilities();
          },
          error: this.showError("Could not add liability."),
        });
      });
  }

  payLiability(l: CompanyLiability): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(420px, calc(100vw - 32px))",
      data: { title: `Pay ${l.name}`, fields: [{ key: "amount", label: `Payment amount (outstanding: ${l.outstandingAmount})`, type: "number", required: true }] },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      const amount = Number(result["amount"]);
      if (!amount || amount <= 0) {
        this.snackbar.open("Enter a valid payment amount.", "Close", { duration: 4000 });
        return;
      }
      this.api.payCompanyLiability(l.id, amount).subscribe({
        next: () => { this.snackbar.open("Payment recorded", "Close", { duration: 3000 }); this.loadLiabilities(); },
        error: this.showError("Could not record payment."),
      });
    });
  }

  editLiability(l: CompanyLiability): void {
    this.api.getCompanyLiability(l.id).subscribe({
      next: (detail) => {
        this.dialog.open(LiabilityFormDialogComponent, { width: "520px", data: { liability: detail } })
          .afterClosed().subscribe((result) => {
            if (!result) return;
            this.api.updateCompanyLiability(l.id, result).subscribe({
              next: () => { this.snackbar.open("Liability updated", "Close", { duration: 3000 }); this.loadLiabilities(); },
              error: this.showError("Could not update liability."),
            });
          });
      },
      error: this.showError("Could not load liability details."),
    });
  }
  async deleteLiabilityRow(l: CompanyLiability) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete liability "${l.name}"? This cannot be undone.`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteCompanyLiability(l.id).subscribe({
      next: () => { this.snackbar.open("Liability deleted", "Close", { duration: 3000 }); this.loadLiabilities(); },
      error: this.showError("Could not delete liability."),
    });
  }

  openJournalEntryDialog(): void {
    this.dialog
      .open(JournalEntryDialogComponent, {
        width: "760px",
        data: { chartOfAccounts: this.chartOfAccounts },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.api.createJournalEntry(result).subscribe({
          next: () => {
            this.snackbar.open("Journal entry posted", "Close", {
              duration: 3000,
            });
            this.loadLedger();
          },
          error: this.showError("Could not post journal entry."),
        });
      });
  }

  canReverse(l: LedgerAccount): boolean {
    return (
      !!l.voucherNo && !l.isReversed && !l.voucherNo.startsWith("REV-")
    );
  }

  async reverseVoucher(l: LedgerAccount) {
    if (!l.voucherNo) return;
    if (
      !await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Reverse voucher "${l.voucherNo}"? This posts an offsetting entry.`, confirmText: 'Continue', danger: true })
    )
      return;
    this.api.reverseVoucher(l.voucherNo).subscribe({
      next: () => {
        this.snackbar.open("Voucher reversed", "Close", { duration: 3000 });
        this.loadLedger();
      },
      error: this.showError("Could not reverse voucher."),
    });
  }
}
