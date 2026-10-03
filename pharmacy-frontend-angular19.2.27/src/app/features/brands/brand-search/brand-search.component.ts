import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, combineLatest, startWith } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ApiService } from '../../../core/services/api.service';
import { Product, Company, DosageForm, BrandType } from '../../../core/models/api.models';

// P2: "Browse by brand or generic name" — search box matches ProductName OR
// GenericName, narrowed by Company / Strength / Dosage form, the same shape
// as medex.com.bd/generics/.../brand-names.
@Component({
  selector: 'app-brand-search',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, MatTableModule, MatButtonToggleModule],
  templateUrl: './brand-search.component.html',
  styleUrl: './brand-search.component.scss'
})
export class BrandSearchComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly companyControl = new FormControl<number | null>(null);
  readonly dosageFormControl = new FormControl<number | null>(null);
  readonly strengthControl = new FormControl<string | null>(null);
  readonly brandTypeControl = new FormControl<BrandType | null>(null);

  companies: Company[] = [];
  dosageForms: DosageForm[] = [];
  strengths: string[] = [];
  results: Product[] = [];
  loading = false;
  selectedGeneric?: string;

  readonly columns = ['name', 'strength', 'dosageForm', 'company', 'price'];

  ngOnInit(): void {
    // Supports being deep-linked with a prefilled search, e.g. clicking a
    // generic name on the brand detail page (?search=Paracetamol), or a
    // dosage form from the Dosage Forms browse page (?dosageFormId=3).
    // A generic link from a medicine profile uses `generic`, which means
    // exact generic-name matches only (not partial brand-name matches).
    this.selectedGeneric = this.route.snapshot.queryParamMap.get('generic') ?? undefined;
    const initialSearch = this.selectedGeneric ?? this.route.snapshot.queryParamMap.get('search');
    if (initialSearch) this.searchControl.setValue(initialSearch, { emitEvent: false });
    const initialDosageFormId = this.route.snapshot.queryParamMap.get('dosageFormId');
    if (initialDosageFormId) this.dosageFormControl.setValue(Number(initialDosageFormId), { emitEvent: false });

    this.api.getCompanies().subscribe(c => this.companies = c);
    this.api.getDosageForms().subscribe(d => this.dosageForms = d);
    this.loadStrengths();

    combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value), debounceTime(300), distinctUntilChanged()),
      this.companyControl.valueChanges.pipe(startWith(this.companyControl.value)),
      this.dosageFormControl.valueChanges.pipe(startWith(this.dosageFormControl.value)),
      this.strengthControl.valueChanges.pipe(startWith(this.strengthControl.value)),
      this.brandTypeControl.valueChanges.pipe(startWith(this.brandTypeControl.value))
    ]).subscribe(() => this.search());

    this.search();
  }

  // Refreshes the Strength dropdown's options to match whatever's
  // currently searched/filtered, so it only ever offers real values
  // (e.g. typing "napa" narrows the list to just "500mg").
  private loadStrengths(): void {
    this.api.getProductStrengths({
      search: this.searchControl.value,
      companyId: this.companyControl.value ?? undefined,
      dosageFormId: this.dosageFormControl.value ?? undefined,
      brandType: this.brandTypeControl.value ?? undefined
    }).subscribe(s => this.strengths = s);
  }

  search(): void {
    this.loading = true;
    this.loadStrengths();
    this.api.searchProductBrands({
      search: this.searchControl.value,
      companyId: this.companyControl.value ?? undefined,
      dosageFormId: this.dosageFormControl.value ?? undefined,
      strength: this.strengthControl.value ?? undefined,
      brandType: this.brandTypeControl.value ?? undefined,
      pageSize: 100
    }).subscribe({
      next: rows => {
        const generic = this.selectedGeneric?.trim().toLocaleLowerCase();
        this.results = generic
          ? rows.filter(row => row.genericName?.trim().toLocaleLowerCase() === generic)
          : rows;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  clearFilters(): void {
    this.companyControl.setValue(null);
    this.dosageFormControl.setValue(null);
    this.strengthControl.setValue(null);
    this.brandTypeControl.setValue(null);
  }

  imageUrl(path?: string): string | null { return this.api.assetUrl(path); }
}
