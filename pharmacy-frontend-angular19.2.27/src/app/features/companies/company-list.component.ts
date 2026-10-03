import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, inject, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Observable } from 'rxjs';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/services/api.service';
import { Company, CompanyDivision } from '../../core/models/api.models';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

// Companies (manufacturers) — the "Pharmaceuticals" lookup behind the
// Brand Search "Company" filter. Previously only reachable indirectly
// through that dropdown; this gives it a proper management page.
@Component({
  selector: 'app-company-list',
  standalone: true,
  imports: [SlicePipe, PaginationComponent, ReactiveFormsModule, FormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatCheckboxModule, MatSnackBarModule, MatTableModule, MatTooltipModule],
  templateUrl: './company-list.component.html',
  styleUrl: './company-list.component.scss'
})
export class CompanyListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  companies: Company[] = [];
  pageIndex = 0; pageSize = 10;
  editingCompany?: Company;
  saving = false;
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    isActive: [true]
  });

  readonly columns = ['name', 'products', 'divisions', 'status', 'actions'];
  expandedCompanyId?: number;
  divisions: CompanyDivision[] = [];
  divisionName = '';
  editingDivisionId?: number;
  divisionLoading = false;
  readonly searchControl = new FormControl('', { nonNullable: true });

  get expandedCompany(): Company | undefined {
    return this.companies.find(company => company.id === this.expandedCompanyId);
  }

  get filteredCompanies(): Company[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.companies;
    return this.companies.filter(company =>
      company.name.toLocaleLowerCase().includes(term) ||
      String(company.productCount ?? '').includes(term) ||
      String(company.divisionCount ?? '').includes(term) ||
      (company.isActive ? 'active' : 'inactive').includes(term)
    );
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getCompanies().subscribe({
      next: companies => this.companies = companies,
      error: err => this.showError(err)
    });
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const value = this.form.getRawValue();
    const request: Observable<unknown> = this.editingCompany
      ? this.api.updateCompany(this.editingCompany.id, value)
      : this.api.createCompany(value.name);

    request.subscribe({
      next: () => {
        this.snackbar.open(this.editingCompany ? 'Company updated.' : 'Company created.', 'Close', { duration: 3000 });
        this.cancelEdit();
        this.load();
      },
      error: (err: unknown) => { this.saving = false; this.showError(err); }
    });
  }

  edit(company: Company): void {
    this.editingCompany = company;
    this.form.setValue({ name: company.name, isActive: company.isActive });
  }

  cancelEdit(): void {
    this.editingCompany = undefined;
    this.saving = false;
    this.form.reset({ name: '', isActive: true });
  }

  async delete(company: Company) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete company "${company.name}"?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteCompany(company.id).subscribe({
      next: () => {
        if (this.editingCompany?.id === company.id) this.cancelEdit();
        this.snackbar.open('Company deleted.', 'Close', { duration: 3000 });
        this.load();
      },
      error: err => this.showError(err)
    });
  }

  toggleDivisions(company: Company): void {
    if (this.expandedCompanyId === company.id) {
      this.expandedCompanyId = undefined;
      this.divisions = [];
      return;
    }
    this.expandedCompanyId = company.id;
    this.editingDivisionId = undefined;
    this.divisionName = '';
    this.loadDivisions(company.id);
  }

  private loadDivisions(companyId: number): void {
    this.divisionLoading = true;
    this.api.getCompanyDivisions(companyId).subscribe({
      next: rows => { if (this.expandedCompanyId === companyId) this.divisions = rows; this.divisionLoading = false; },
      error: err => { this.divisionLoading = false; this.showError(err); }
    });
  }

  saveDivision(company: Company): void {
    const name = this.divisionName.trim();
    if (!name || this.divisionLoading) return;
    this.divisionLoading = true;
    const request: Observable<unknown> = this.editingDivisionId
      ? this.api.updateCompanyDivision(company.id, this.editingDivisionId, name)
      : this.api.createCompanyDivision(company.id, name);
    request.subscribe({
      next: () => {
        this.snackbar.open(this.editingDivisionId ? 'Division renamed.' : 'Division added.', 'Close', { duration: 2500 });
        this.divisionName = '';
        this.editingDivisionId = undefined;
        this.loadDivisions(company.id);
        this.load();
      },
      error: (err: unknown) => { this.divisionLoading = false; this.showError(err); }
    });
  }

  editDivision(division: CompanyDivision): void {
    this.editingDivisionId = division.id;
    this.divisionName = division.name;
  }

  cancelDivisionEdit(): void { this.editingDivisionId = undefined; this.divisionName = ''; }

  async deleteDivision(company: Company, division: CompanyDivision) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete division "${division.name}"?`, confirmText: 'Continue', danger: true })) return;
    this.divisionLoading = true;
    this.api.deleteCompanyDivision(company.id, division.id).subscribe({
      next: () => { this.snackbar.open('Division deleted.', 'Close', { duration: 2500 }); this.loadDivisions(company.id); this.load(); },
      error: err => { this.divisionLoading = false; this.showError(err); }
    });
  }

  private showError(err: unknown): void {
    const message = (err as { error?: { message?: string } })?.error?.message || 'Unable to save the company.';
    this.snackbar.open(message, 'Close', { duration: 5000 });
  }
}
