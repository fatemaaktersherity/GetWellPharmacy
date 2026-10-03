import { Component, inject, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../../core/services/api.service';
import { Company, CompanyDivision, Product, ProductFilterOptions } from '../../../core/models/api.models';

@Component({
    selector: 'app-company-products',
    standalone: true,
    imports: [CurrencyPipe, RouterLink, ReactiveFormsModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule],
    templateUrl: './company-products.component.html',
    styleUrl: './company-products.component.scss'
})
export class CompanyProductsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly route = inject(ActivatedRoute);

    companyId = 0;
    company: Company | null = null;
    divisions: CompanyDivision[] = [];
    products: Product[] = [];

    /** Dosage forms / generic names that actually occur in THIS company's
     *  catalogue — from /products/filter-options, so neither dropdown can
     *  offer an option that yields an empty table. */
    filterOptions: ProductFilterOptions = { dosageForms: [], genericNames: [] };

    readonly searchControl = new FormControl('', { nonNullable: true });
    readonly dosageFormControl = new FormControl<number | null>(null);
    readonly genericControl = new FormControl<string | null>(null);

    readonly cols = ['image', 'name', 'strength', 'dosageForm', 'generic', 'stock', 'price'];

    get filteredProducts(): Product[] {
        const term = this.searchControl.value.trim().toLocaleLowerCase();
        const dosageFormId = this.dosageFormControl.value;
        const generic = this.genericControl.value;

        return this.products.filter(p => {
            if (dosageFormId && p.dosageFormId !== dosageFormId) return false;
            if (generic && p.genericName !== generic) return false;
            if (!term) return true;
            return [p.productName, p.genericName, p.strength, p.dosageFormName]
                .join(' ').toLocaleLowerCase().includes(term);
        });
    }

    get hasActiveFilters(): boolean {
        return !!(this.searchControl.value.trim() || this.dosageFormControl.value || this.genericControl.value);
    }

    clearFilters(): void {
        this.searchControl.setValue('');
        this.dosageFormControl.setValue(null);
        this.genericControl.setValue(null);
    }

    ngOnInit(): void {
        this.companyId = Number(this.route.snapshot.paramMap.get('id'));
        this.api.getCompanies().subscribe(list => this.company = list.find(c => c.id === this.companyId) ?? null);
        this.api.getCompanyDivisions(this.companyId).subscribe({ next: divisions => this.divisions = divisions, error: () => this.divisions = [] });
        this.api.getProductFilterOptions(this.companyId).subscribe({
            next: opts => this.filterOptions = opts,
            // A failed options call shouldn't blank the page — the table and
            // the free-text search still work without the dropdowns.
            error: () => this.filterOptions = { dosageForms: [], genericNames: [] },
        });
        this.load();
    }

    load(): void {
        this.api.getProducts({ companyId: this.companyId, pageSize: 500 }).subscribe(p => this.products = p);
    }

    imageUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
