import { Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MessageDialogService } from "../../../shared/message-dialog/message-dialog.service";
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatOptionModule } from "@angular/material/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDialog } from "@angular/material/dialog";
import { InputPromptDialogComponent } from "../../../shared/input-prompt-dialog/input-prompt-dialog.component";
import { CommonModule } from "@angular/common";
import { ApiService } from "../../../core/services/api.service";
import { LiveUpdatesService } from "../../../core/services/live-updates.service";
import {
  Unit,
  Product,
  ProductCreate,
  ProductPackaging,
  Company,
  DosageForm,
  ProductGroup,
  ProductGroupDetail,
  ProductCategory,
  BrandType,
} from "../../../core/models/api.models";

@Component({
  selector: "app-product-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
  ],
  templateUrl: "./product-form.component.html",
  styleUrl: "./product-form.component.scss",
})
export class ProductFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageDialog = inject(MessageDialogService);
  private readonly liveUpdates = inject(LiveUpdatesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);

  form!: FormGroup;
  units: Unit[] = [];
  companies: Company[] = [];
  dosageForms: DosageForm[] = [];
  productGroups: ProductGroup[] = [];
  variants: ProductGroupDetail["variants"] = [];
  categories: ProductCategory[] = [];
  loading = false;
  isEditMode = false;
  productId?: number;
  selectedImage?: File;
  imagePreview?: string;

  ngOnInit(): void {
    this.initForm();
    this.setupDistributorPriceSync();
    this.loadUnits();
    this.loadCompanies();
    this.loadDosageForms();
    this.loadProductGroups();
    this.loadProductCategories();
    this.checkEditMode();
    this.liveUpdates.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resource }) => {
        if (["productgroups", "products", "dosageforms", "productcategories"].includes(resource.toLowerCase())) {
          this.refreshProductReferences();
        }
      });
  }

  private initForm(): void {
    this.form = this.fb.group({
      productCode: [""],
      productName: ["", Validators.required],
      strength: ["", Validators.required],
      genericName: [""],
      brandType: ["Allopathic" as BrandType, Validators.required],
      companyId: [null as number | null],
      dosageFormId: [null as number | null],
      productGroupId: [null as number | null],
      productVariantId: [null as number | null],
      productCategoryId: [null as number | null],
      unitId: ["", Validators.required],
      unitPrice: ["", [Validators.required, Validators.min(0)]],
      purchasePrice: ["", [Validators.required, Validators.min(0)]],
      distributorPrice: [null as number | null, Validators.min(0)],
      salePrice: ["", Validators.min(0)],
      minStockQty: ["", [Validators.required, Validators.min(0)]],
      maxStockQty: ["", [Validators.required, Validators.min(0)]],
      requiresPrescription: [false],
      prices: this.fb.array([]),
      // Medicine Details — optional pharmacology/regulatory info shown on
      // the product's detail page ("Innovator's Monograph") and reused
      // wherever product.details is read (e.g. the Sale form's reference
      // panel already shows requiresPrescription from here).
      details: this.fb.group({
        description: [""],
        schedule: [""],
        darNo: [""],
        storageConditions: [""],
        temperatureMin: [null as number | null],
        temperatureMax: [null as number | null],
        composition: [""],
        sideEffects: [""],
        pregnancyCategory: [""],
        isControlledDrug: [false],
      }),
    });
  }

  // Whenever the product-level Distributor Price changes, sync every
  // existing packaging row: recalculate (qty × new base price) if the base
  // has a value, or clear the row's Distributor Price to null if the base
  // is cleared. Also re-runs each row's validator so the "one filled,
  // other blank" error appears/disappears immediately, not just on submit.
  private setupDistributorPriceSync(): void {
    this.form.get("distributorPrice")?.valueChanges.subscribe((value) => {
      const baseDistributorPrice = Number(value) || 0;
      this.packagings.controls.forEach((group) => {
        if (baseDistributorPrice > 0) {
          const qty = Number(group.get("baseQuantity")?.value) || 0;
          if (qty > 0) {
            group
              .get("distributorPrice")
              ?.setValue(+(qty * baseDistributorPrice).toFixed(2), {
                emitEvent: false,
              });
          }
        } else {
          group.get("distributorPrice")?.setValue(null, { emitEvent: false });
        }
        group
          .get("distributorPrice")
          ?.updateValueAndValidity({ emitEvent: false });
      });
    });
  }

  get detailsGroup(): FormGroup {
    return this.form.get("details") as FormGroup;
  }

  get packagings(): FormArray {
    return this.form.get("prices") as FormArray;
  }

  addPackaging(packaging?: ProductPackaging): void {
    const group = this.fb.group({
      id: [packaging?.id],
      unitId: [packaging?.unitId ?? null, Validators.required],
      displayName: [packaging?.displayName ?? "", Validators.maxLength(150)],
      perUnitPrice: [
        packaging?.perUnitPrice ?? 0,
        [Validators.required, Validators.min(0)],
      ],
      baseQuantity: [
        packaging?.baseQuantity ?? 1,
        [Validators.required, Validators.min(0.0001)],
      ],
      purchasePrice: [packaging?.purchasePrice ?? null, Validators.min(0)],
      salePrice: [packaging?.salePrice ?? null, Validators.min(0)],
      distributorPrice: [
        packaging?.distributorPrice ?? null,
        [Validators.min(0), this.distributorPriceConsistencyValidator],
      ],
    });

    // Auto-calculates Package Price, Purchase Price, Sale Price, and
    // Distributor Price for this packaging whenever Base Quantity changes
    // (qty × the matching base product price). All four stay fully
    // manual-editable afterwards — typing over any of them sticks until
    // Base Quantity changes again.
    group.get("baseQuantity")?.valueChanges.subscribe((baseQuantity) => {
      const qty = Number(baseQuantity) || 0;
      if (qty <= 0) return;

      const baseSalePrice = Number(this.form.get("salePrice")?.value) || 0;
      const basePurchasePrice =
        Number(this.form.get("purchasePrice")?.value) || 0;
      const baseDistributorPrice =
        Number(this.form.get("distributorPrice")?.value) || 0;

      if (baseSalePrice > 0) {
        group
          .get("perUnitPrice")
          ?.setValue(+(qty * baseSalePrice).toFixed(2), { emitEvent: false });
        group
          .get("salePrice")
          ?.setValue(+(qty * baseSalePrice).toFixed(2), { emitEvent: false });
      }
      if (basePurchasePrice > 0) {
        group
          .get("purchasePrice")
          ?.setValue(+(qty * basePurchasePrice).toFixed(2), {
            emitEvent: false,
          });
      }
      if (baseDistributorPrice > 0) {
        group
          .get("distributorPrice")
          ?.setValue(+(qty * baseDistributorPrice).toFixed(2), {
            emitEvent: false,
          });
      }
      group
        .get("distributorPrice")
        ?.updateValueAndValidity({ emitEvent: false });
    });

    this.packagings.push(group);
  }

  removePackaging(index: number): void {
    this.packagings.removeAt(index);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      this.messageDialog.warning("Please select an image file.");
      return;
    }
    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = () => (this.imagePreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  private loadUnits(): void {
    this.api.getUnits().subscribe((u) => (this.units = u));
  }

  private loadCompanies(): void {
    this.api.getCompanies().subscribe((c) => (this.companies = c));
  }

  private loadDosageForms(): void {
    this.api.getDosageForms().subscribe((d) => (this.dosageForms = d));
  }

  private loadProductGroups(): void {
    this.api
      .getProductGroups()
      .subscribe((groups) => (this.productGroups = groups));
  }

  private loadProductCategories(): void {
    this.api.getProductCategories().subscribe({ next: categories => this.categories = categories });
  }

  /** Refresh selector data without replacing or resetting the active form. */
  private refreshProductReferences(): void {
    this.loadProductGroups();
    this.loadProductCategories();
    const groupId = this.form.get("productGroupId")?.value as number | null;
    if (!groupId) return;
    const selectedVariantId = this.form.get("productVariantId")?.value as number | null;
    this.api.getProductGroup(groupId).subscribe({
      next: group => {
        this.variants = group.variants;
        if (selectedVariantId && !group.variants.some(variant => variant.id === selectedVariantId)) {
          this.form.get("productVariantId")?.setValue(null);
        }
      },
    });
  }

  onProductGroupChanged(groupId: number | null, preserveCategory = false): void {
    this.variants = [];
    if (!preserveCategory) this.form.patchValue({ productVariantId: null, productCategoryId: null });
    if (!groupId) return;
    this.api.getProductGroup(groupId).subscribe((group) => {
      this.variants = group.variants;
      if (!preserveCategory) this.form.patchValue({ productCategoryId: group.categoryId ?? null });
      if (this.isEditMode) return;
      const patch: Record<string, unknown> = {};
      if (!this.form.get("productName")?.value) patch["productName"] = group.name;
      if (!this.form.get("genericName")?.value) patch["genericName"] = group.genericName ?? "";
      if (!this.form.get("companyId")?.value) patch["companyId"] = group.companyId ?? null;
      this.form.patchValue(patch);
    });
  }

  onProductVariantChanged(variantId: number | null): void {
    const variant = this.variants.find((v) => v.id === variantId);
    if (!variant) return;
    this.form.patchValue({ strength: variant.strength, dosageFormId: variant.dosageFormId });
  }

  addNewCompany(): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(420px, calc(100vw - 32px))",
      data: { title: "Add Company", fields: [{ key: "name", label: "Company name", required: true }] },
    }).afterClosed().subscribe((result) => {
      const name = result?.["name"].trim();
      if (!name) return;
      this.api.createCompany(name).subscribe((c) => {
        this.companies = [...this.companies, c].sort((a, b) => a.name.localeCompare(b.name));
        this.form.get("companyId")?.setValue(c.id);
      });
    });
  }

  addNewDosageForm(): void {
    this.dialog.open(InputPromptDialogComponent, {
      width: "min(420px, calc(100vw - 32px))",
      data: { title: "Add Dosage Form", fields: [{ key: "name", label: "Dosage form name", required: true }] },
    }).afterClosed().subscribe((result) => {
      const name = result?.["name"].trim();
      if (!name) return;
      this.api.createDosageForm(name).subscribe((d) => {
        this.dosageForms = [...this.dosageForms, d].sort((a, b) => a.name.localeCompare(b.name));
        this.form.get("dosageFormId")?.setValue(d.id);
      });
    });
  }

  private checkEditMode(): void {
    this.productId = this.route.snapshot.paramMap.get("id")
      ? Number(this.route.snapshot.paramMap.get("id"))
      : undefined;
    if (this.productId) {
      this.isEditMode = true;
      this.loadProduct();
    }
  }

  private loadProduct(): void {
    if (!this.productId) return;
    this.api.getProduct(this.productId).subscribe((p) => {
      this.form.patchValue({
        productCode: p.productCode,
        productName: p.productName,
        strength: p.strength,
        genericName: p.genericName,
        brandType: p.brandType ?? "Allopathic",
        companyId: p.companyId,
        dosageFormId: p.dosageFormId,
        productGroupId: p.productGroupId ?? null,
        productVariantId: p.productVariantId ?? null,
        productCategoryId: p.productCategoryId ?? null,
        unitId: p.unitId,
        unitPrice: p.unitPrice,
        purchasePrice: p.purchasePrice,
        distributorPrice: p.distributorPrice ?? null,
        salePrice: p.salePrice,
        minStockQty: p.minStockQty,
        maxStockQty: p.maxStockQty,
        requiresPrescription: p.details?.requiresPrescription ?? false,
      });
      this.detailsGroup.patchValue({
        description: p.details?.description ?? "",
        schedule: p.details?.schedule ?? "",
        darNo: p.details?.darNo ?? "",
        storageConditions: p.details?.storageConditions ?? "",
        temperatureMin: p.details?.temperatureMin ?? null,
        temperatureMax: p.details?.temperatureMax ?? null,
        composition: p.details?.composition ?? "",
        sideEffects: p.details?.sideEffects ?? "",
        pregnancyCategory: p.details?.pregnancyCategory ?? "",
        isControlledDrug: p.details?.isControlledDrug ?? false,
      });
      if (p.productGroupId) this.onProductGroupChanged(p.productGroupId, true);
      this.imagePreview = this.api.assetUrl(p.imagePath) ?? undefined;
      this.packagings.clear();
      p.prices?.forEach((price) => this.addPackaging(price));
    });
  }

  onSubmit(): void {
    if (!this.form.valid) return;
    const packagingKeys = this.packagings.controls.map(
      (control) =>
        `${Number(control.get("unitId")?.value)}|${String(
          control.get("displayName")?.value ?? "",
        )
          .trim()
          .toLowerCase()}`,
    );
    if (new Set(packagingKeys).size !== packagingKeys.length) {
      this.messageDialog.warning("Each packaging name can be added only once for the same unit.");
      return;
    }
    this.loading = true;
    const { requiresPrescription, details, ...formValue } = this.form.value;
    const payload: ProductCreate = {
      ...formValue,
      details: {
        ...details,
        requiresPrescription: !!requiresPrescription,
        isControlledDrug: !!details?.isControlledDrug,
      },
    } as ProductCreate;

    if (this.isEditMode && this.productId) {
      this.api.updateProduct(this.productId, payload).subscribe({
        next: () => this.uploadImageThenFinish(this.productId!),
        error: (err) => {
          this.loading = false;
          console.error("Error updating product:", err);
        },
      });
    } else {
      this.api.createProduct(payload).subscribe({
        next: (product) => this.uploadImageThenFinish(product.id),
        error: (err) => {
          this.loading = false;
          console.error("Error creating product:", err);
        },
      });
    }
  }

  private uploadImageThenFinish(id: number): void {
    if (!this.selectedImage) {
      this.finish();
      return;
    }
    this.api.uploadProductImage(id, this.selectedImage).subscribe({
      next: () => this.finish(),
      error: (err) => {
        this.loading = false;
        console.error("Image upload failed:", err);
        const message =
          err?.error?.message ||
          "Product saved, but the image could not be uploaded.";
        this.messageDialog.error(message);
      },
    });
  }

  private finish(): void {
    this.loading = false;
    this.router.navigate(["/products"]);
  }

  // Enforces: either BOTH the product-level Distributor Price and this
  // packaging row's Distributor Price are filled, or BOTH are empty. One
  // filled while the other is blank is an error; both blank is fine.
  private readonly distributorPriceConsistencyValidator: ValidatorFn = (
    control,
  ) => {
    if (!this.form) return null;
    const baseValue = this.form.get("distributorPrice")?.value;
    const baseHasValue =
      baseValue !== null &&
      baseValue !== undefined &&
      baseValue !== "" &&
      Number(baseValue) > 0;
    const packagingValue = control.value;
    const packagingHasValue =
      packagingValue !== null &&
      packagingValue !== undefined &&
      packagingValue !== "" &&
      Number(packagingValue) > 0;
    return baseHasValue !== packagingHasValue
      ? { distributorPriceMismatch: true }
      : null;
  };
}
