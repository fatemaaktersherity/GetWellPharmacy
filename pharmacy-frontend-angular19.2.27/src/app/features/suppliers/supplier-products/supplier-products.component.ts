import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Supplier, SupplierProduct, Product, Unit } from '../../../core/models/api.models';

// The actual Supplier<->Product many-to-many page: everything this supplier
// has ever been linked to, each with its OWN per-unit prices (Pcs/Box/Strip/
// Vial...) — never one flat number for the whole product. Also doubles as
// "purchase history" via the Last Purchase column, auto-updated whenever a
// Purchase Invoice is posted against this supplier+product.
@Component({
  selector: 'app-supplier-products',
  standalone: true,
  imports: [
    DecimalPipe, DatePipe, RouterLink, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatAutocompleteModule, MatExpansionModule, MatCheckboxModule
  ],
  templateUrl: './supplier-products.component.html',
  styleUrl: './supplier-products.component.scss'
})
export class SupplierProductsComponent implements OnInit {
    private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  supplierId = 0;
  supplier: Supplier | null = null;
  links: SupplierProduct[] = [];
  units: Unit[] = [];

  // "Link a new product" search
  readonly productSearch = this.fb.control('', { nonNullable: true });
  productOptions: Product[] = [];
  selectedProduct: Product | null = null;

  // One editable FormGroup per link, keyed by link.id, holding a FormArray of price rows.
  priceForms = new Map<number, FormGroup>();

  ngOnInit(): void {
    this.supplierId = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getUnits().subscribe(u => this.units = u);
    this.api.getSupplier(this.supplierId).subscribe(s => this.supplier = s);
    this.load();

    this.productSearch.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(term => {
      this.selectedProduct = null;
      if (!term || term.length < 2) { this.productOptions = []; return; }
      this.api.getProducts(term).subscribe(p => this.productOptions = p);
    });
  }

  load(): void {
    this.api.getSupplierProductsBySupplier(this.supplierId, true).subscribe(links => {
      this.links = links;
      this.priceForms.clear();
      for (const link of links) this.priceForms.set(link.id, this.buildPriceForm(link));
    });
  }

  private buildPriceForm(link: SupplierProduct): FormGroup {
    const rows = (link.prices ?? []).map(p => this.fb.group({
      id: [p.id ?? null],
      unitId: [p.unitId, Validators.required],
      baseQuantity: [p.baseQuantity ?? 1, [Validators.required, Validators.min(0.0001)]],
      purchasePrice: [p.purchasePrice ?? 0, [Validators.required, Validators.min(0)]],
      salePrice: [p.salePrice ?? null],
      unitPrice: [p.unitPrice ?? null],
      distributorPrice: [p.distributorPrice ?? null]
    }));
    return this.fb.group({ prices: this.fb.array(rows) });
  }

  pricesArray(linkId: number): FormArray {
    return this.priceForms.get(linkId)!.get('prices') as FormArray;
  }

  addPriceRow(linkId: number): void {
    this.pricesArray(linkId).push(this.fb.group({
      id: [null],
      unitId: [this.units[0]?.unitId ?? null, Validators.required],
      baseQuantity: [1, [Validators.required, Validators.min(0.0001)]],
      purchasePrice: [0, [Validators.required, Validators.min(0)]],
      salePrice: [null],
      unitPrice: [null],
      distributorPrice: [null]
    }));
  }

  removePriceRow(linkId: number, index: number): void {
    this.pricesArray(linkId).removeAt(index);
  }

  savePrices(link: SupplierProduct): void {
    const form = this.priceForms.get(link.id)!;
    if (form.invalid) { form.markAllAsTouched(); return; }

    this.api.updateSupplierProduct(link.id, {
      supplierId: link.supplierId,
      productId: link.productId,
      supplierProductCode: link.supplierProductCode,
      isPreferred: link.isPreferred,
      isActive: link.isActive,
      note: link.note,
      prices: form.value.prices
    }).subscribe(() => this.load());
  }

  selectProduct(product: Product): void {
    this.selectedProduct = product;
    this.productSearch.setValue(product.productName, { emitEvent: false });
    this.productOptions = [];
  }

  linkProduct(): void {
    if (!this.selectedProduct) return;
    this.api.createSupplierProduct({
      supplierId: this.supplierId,
      productId: this.selectedProduct.id,
      isPreferred: false,
      isActive: true
    }).subscribe(() => {
      this.selectedProduct = null;
      this.productSearch.setValue('');
      this.load();
    });
  }

  togglePreferred(link: SupplierProduct): void {
    this.api.updateSupplierProduct(link.id, {
      supplierId: link.supplierId,
      productId: link.productId,
      supplierProductCode: link.supplierProductCode,
      isPreferred: !link.isPreferred,
      isActive: link.isActive,
      note: link.note
    }).subscribe(() => this.load());
  }

  async unlink(link: SupplierProduct) {
    if (!await this.confirmDialog.confirmAsync({ title: 'Please confirm', message: `Remove ${link.productName} from this supplier's catalogue?`, confirmText: 'Continue', danger: true })) return;
    this.api.deleteSupplierProduct(link.id).subscribe(() => this.load());
  }
}
