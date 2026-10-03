import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ApiService } from "../../../core/services/api.service";
import { SupplierContact } from "../../../core/models/api.models";

@Component({
  selector: "app-supplier-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
  ],
  templateUrl: "./supplier-form.component.html",
  styleUrl: "./supplier-form.component.scss",
})
export class SupplierFormComponent implements OnInit {
  readonly individualCompanyValue = -1;
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  form!: any;
  isEditMode = false;
  supplierId?: number;
  loading = false;
  supplierTypes: any[] = [];
  companies: any[] = [];
  logoFile?: File;
  logoPreview?: string;

  ngOnInit(): void {
    this.initForm();
    // Companies আগে load করে নিচ্ছি, তারপর edit mode হলে supplier data
    // patch করছি — নাহলে patch হওয়ার সময় companies[] খালি থাকলে
    // Manufacturer name-sync কাজ করবে না (race condition)।
    this.api.getCompanies().subscribe((c) => {
      this.companies = c;
      this.checkEditMode();
    });
  }

  private initForm(): void {
    this.form = this.fb.group({
      companyId: [this.individualCompanyValue],
      supplierName: ["", [Validators.required, Validators.minLength(3)]],
      supplierTypeId: [null, Validators.required],
      contactPerson: [""],
      phone: [""],
      email: ["", Validators.email],
      address: [""],
      distributor: [false],
      openingBalance: [0],
      // Synced whole-array on save via SupplierCreate/UpdateDto.Contacts —
      // no id (or 0) inserts a new row, an existing id updates that row,
      // and any row missing from what we send gets removed on the backend.
      contacts: this.fb.array([]),
    });
    this.api
      .getSupplierTypes()
      .subscribe((types) => (this.supplierTypes = types));

    // Keep Supplier Name in sync with the chosen Company. Two triggers:
    // 1) Company changes (existing behaviour)
    // 2) Supplier Type changes to "Manufacturer" — manufacturers are
    //    always known by their company/brand name, not a person's name,
    //    so if a Company is already picked, mirror its name in as soon
    //    as "Manufacturer" is selected, regardless of pick order.
    this.form
      .get("companyId")
      .valueChanges.subscribe((companyId: number | null) => {
        this.syncNameFromCompany(companyId, this.form.get("supplierTypeId").value);
      });

    this.form
      .get("supplierTypeId")
      .valueChanges.subscribe((typeId: number | null) => {
        this.syncNameFromCompany(this.form.get("companyId").value, typeId);
      });
  }

  private syncNameFromCompany(companyId: number | null, typeId: number | null): void {
    if (!companyId) return;
    const type = this.supplierTypes.find((t) => t.id === typeId);
    const isManufacturer = type?.name?.trim().toLowerCase() === "manufacturer";
    if (!isManufacturer) return;

    const company = this.companies.find((c) => c.id === companyId);
    if (company) this.form.get("supplierName").setValue(company.name);
  }

  get contactsArray(): FormArray {
    return this.form.get("contacts") as FormArray;
  }

  addContact(contact?: SupplierContact): void {
    this.contactsArray.push(
      this.fb.group({
        id: [contact?.id ?? null],
        contactName: [contact?.contactName ?? "", Validators.required],
        designation: [contact?.designation ?? ""],
        phone: [contact?.phone ?? ""],
        isPrimary: [contact?.isPrimary ?? false],
      }),
    );
  }

  removeContact(index: number): void {
    this.contactsArray.removeAt(index);
  }

  private checkEditMode(): void {
    const id = this.route.snapshot.paramMap.get("id");
    if (id) {
      this.isEditMode = true;
      this.supplierId = Number(id);
      this.loadSupplier();
    }
  }

  private loadSupplier(): void {
    if (!this.supplierId) return;
    this.api.getSupplier(this.supplierId).subscribe({
      next: (s) => {
        this.form.patchValue({
          ...s,
          companyId: s.companyId ?? this.individualCompanyValue,
        });
        this.contactsArray.clear();
        (s.contacts ?? []).forEach((c) => this.addContact(c));
      },
      error: () => this.snackbar.open("Failed", "Close", { duration: 5000 }),
    });
  }

  selectLogo(event: Event): void {
    this.logoFile = (event.target as HTMLInputElement).files?.[0];
    if (this.logoFile) {
      const reader = new FileReader();
      reader.onload = () => (this.logoPreview = String(reader.result));
      reader.readAsDataURL(this.logoFile);
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    const payload = {
      ...this.form.value,
      companyId:
        this.form.value.companyId === this.individualCompanyValue
          ? null
          : this.form.value.companyId,
    };
    const request: any =
      this.isEditMode && this.supplierId
        ? this.api.updateSupplier(this.supplierId, payload)
        : this.api.createSupplier(payload);
    request.subscribe({
      next: (result: any) => {
        const id = this.supplierId || result?.supplierId;
        if (!this.logoFile || !id) {
          this.finish();
          return;
        }
        this.api.uploadSupplierLogo(id, this.logoFile).subscribe({
          next: () => this.finish(),
          error: () => {
            this.loading = false;
            this.snackbar.open(
              "Supplier saved, but logo upload failed.",
              "Close",
              { duration: 5000 },
            );
          },
        });
      },
      error: () => {
        this.loading = false;
        this.snackbar.open("Failed", "Close", { duration: 5000 });
      },
    });
  }

  private finish(): void {
    this.snackbar.open(this.isEditMode ? "Updated" : "Created", "Close", {
      duration: 3000,
    });
    this.router.navigate(["/suppliers"]);
  }
}
