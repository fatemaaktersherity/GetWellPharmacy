import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Component, OnInit, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/services/api.service';
import { Company, CompanyDivision, ProductCategory, ProductGroup, ProductGroupWrite } from '../../core/models/api.models';
import { ProductGroupDetailComponent } from './product-group-detail.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

@Component({
  selector: 'app-product-group-list', standalone: true,
  imports: [SlicePipe, PaginationComponent, ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatSnackBarModule, MatTableModule, ProductGroupDetailComponent],
  templateUrl: './product-group-list.component.html', styleUrl: './product-group-list.component.scss'
})
export class ProductGroupListComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService); private readonly fb = inject(FormBuilder); private readonly snackbar = inject(MatSnackBar);
  groups: ProductGroup[] = []; companies: Company[] = []; divisions: CompanyDivision[] = []; categories: ProductCategory[] = [];
  editing?: ProductGroup; saving = false; loading = true; loadingDivisions = false;
  showNewDivision = false; newDivisionName = ''; savingDivision = false;
  showNewCategory = false; newCategoryName = ''; newCategoryParentId = 0; savingCategory = false;
  pageIndex = 0; pageSize = 10;
  readonly columns = ['name', 'generic', 'company', 'category', 'variants', 'actions'];
  expandedGroupId: number | null = null;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly form = this.fb.group({ name: ['', [Validators.required, Validators.maxLength(200)]], genericName: ['', Validators.maxLength(200)], companyId: [null as number | null], companyDivisionId: [null as number | null], categoryId: [null as number | null] });
  get filteredGroups(): ProductGroup[] {
    const term = this.searchControl.value.trim().toLocaleLowerCase();
    if (!term) return this.groups;
    return this.groups.filter(group => [group.name, group.genericName || '', group.companyName || '', group.categoryName || '', group.parentCategoryName || '', group.variantCount]
      .join(' ').toLocaleLowerCase().includes(term));
  }
  ngOnInit(): void {
    this.load();
    this.api.getCompanies().subscribe(c => this.companies = c);
    this.loadCategories();
    this.form.controls.companyId.valueChanges.subscribe(id => this.companyChanged(id));
  }
  private companyChanged(companyId: number | null): void {
    this.divisions = [];
    this.form.controls.companyDivisionId.setValue(null, { emitEvent: false });
    this.showNewDivision = false;
    this.newDivisionName = '';
    if (!companyId) return;
    this.loadingDivisions = true;
    this.api.getCompanyDivisions(companyId).subscribe({
      next: rows => { this.divisions = rows; this.loadingDivisions = false; },
      error: e => { this.loadingDivisions = false; this.error(e); },
    });
  }
  createDivision(): void {
    const companyId = this.form.controls.companyId.value;
    const name = this.newDivisionName.trim();
    if (!companyId || !name || this.savingDivision) return;
    this.savingDivision = true;
    this.api.createCompanyDivision(companyId, name).subscribe({
      next: division => {
        this.divisions = [...this.divisions, division].sort((a, b) => a.name.localeCompare(b.name));
        this.form.controls.companyDivisionId.setValue(division.id);
        this.newDivisionName = '';
        this.showNewDivision = false;
        this.savingDivision = false;
        this.snackbar.open('Company division added.', 'Close', { duration: 3000 });
      },
      error: e => { this.savingDivision = false; this.error(e); },
    });
  }
  loadCategories(): void { this.api.getProductCategories().subscribe({ next: rows => this.categories = rows, error: e => this.error(e) }); }
  createCategory(): void {
    const name = this.newCategoryName.trim();
    if (!name || this.savingCategory) return;
    this.savingCategory = true;
    this.api.createProductCategory(name, this.newCategoryParentId > 0 ? this.newCategoryParentId : null).subscribe({
      next: category => {
        this.categories = [...this.categories, category].sort((a, b) => (a.parentCategoryName || a.name).localeCompare(b.parentCategoryName || b.name) || a.name.localeCompare(b.name));
        this.form.controls.categoryId.setValue(category.id);
        this.newCategoryName = ''; this.newCategoryParentId = 0; this.showNewCategory = false; this.savingCategory = false;
        if (this.editing && this.form.valid) {
          const raw = this.form.getRawValue();
          const value: ProductGroupWrite = { name: raw.name ?? '', genericName: raw.genericName ?? undefined, companyId: raw.companyId, companyDivisionId: raw.companyDivisionId, categoryId: raw.categoryId };
          this.saving = true;
          this.api.updateProductGroup(this.editing.id, value).subscribe({
            next: () => {
              this.snackbar.open('Category saved and linked to the product group.', 'Close', { duration: 4000 });
              this.cancel();
              this.load();
            },
            error: e => { this.saving = false; this.error(e); }
          });
        } else {
          this.snackbar.open('Category saved and selected. Click Add Group to save the product group with it.', 'Close', { duration: 5000 });
        }
      },
      error: e => { this.savingCategory = false; this.error(e); }
    });
  }
  load(): void { this.loading = true; this.api.getProductGroups().subscribe({ next: r => { this.groups = r; this.loading = false; }, error: e => this.error(e) }); }
  save(): void { if (this.form.invalid || this.saving) return; this.saving = true; const raw = this.form.getRawValue(); const value: ProductGroupWrite = { name: raw.name ?? '', genericName: raw.genericName ?? undefined, companyId: raw.companyId, companyDivisionId: raw.companyDivisionId, categoryId: raw.categoryId }; const done = () => { this.snackbar.open(this.editing ? 'Product group updated.' : 'Product group added.', 'Close', { duration: 3000 }); this.cancel(); this.load(); }; const failed = (e: unknown) => { this.saving = false; this.error(e); }; if (this.editing) this.api.updateProductGroup(this.editing.id, value).subscribe({ next: done, error: failed }); else this.api.createProductGroup(value).subscribe({ next: done, error: failed }); }
  edit(group: ProductGroup): void { this.editing = group; this.form.setValue({ name: group.name, genericName: group.genericName ?? '', companyId: group.companyId ?? null, companyDivisionId: group.companyDivisionId ?? null, categoryId: group.categoryId ?? null }); }
  cancel(): void { this.editing = undefined; this.saving = false; this.form.reset({ name: '', genericName: '', companyId: null, companyDivisionId: null, categoryId: null }); this.divisions = []; this.showNewDivision = false; this.newDivisionName = ''; this.showNewCategory = false; this.newCategoryName = ''; this.newCategoryParentId = 0; }
  async delete(group: ProductGroup) { if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Delete product group "${group.name}"?`, confirmText: 'Continue', danger: true })) return; this.api.deleteProductGroup(group.id).subscribe({ next: () => { this.snackbar.open('Product group deleted.', 'Close', { duration: 3000 }); this.load(); }, error: e => this.error(e) }); }
  // Toggles the inline "manage variants" section for a row in place of
  // navigating to the /product-groups/:id page.
  toggleVariants(group: ProductGroup): void { this.expandedGroupId = this.expandedGroupId === group.id ? null : group.id; }
  closeVariants(): void { this.expandedGroupId = null; }
  private error(err: unknown): void { this.loading = false; this.snackbar.open((err as { error?: { message?: string } })?.error?.message || 'Unable to save product group.', 'Close', { duration: 5000 }); }
}
