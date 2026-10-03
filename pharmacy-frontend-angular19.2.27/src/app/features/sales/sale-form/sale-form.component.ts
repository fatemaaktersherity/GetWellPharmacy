import { Component, DestroyRef, inject, OnInit, AfterViewInit, ElementRef, ViewChild } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import {
  FormBuilder,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { debounceTime, map, switchMap } from "rxjs/operators";
import { Router, RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from "@angular/material/autocomplete";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialog } from "@angular/material/dialog";
import { ApiService } from "../../../core/services/api.service";
import {
  Customer,
  Sale,
  SaleItem,
  ProductPackaging,
  ProductStockListItem,
  Company,
  DosageForm,
  Prescription,
  WarehouseFull,
} from "../../../core/models/api.models";
import { AlternateBrandsDialogComponent } from "../alternate-brands-dialog/alternate-brands-dialog.component";
import {
  PaymentMethodService,
  PaymentMethod,
} from "../../payment-methods/payment-method.service";
import {
  ConfirmSaleDialogComponent,
  ConfirmSaleDialogData,
  ConfirmSaleResult,
} from "../confirm-sale-dialog/confirm-sale-dialog"
import { MessageDialogService } from "../../../shared/message-dialog/message-dialog.service";
import { LiveUpdatesService } from "../../../core/services/live-updates.service";
import { SalePrintService } from "../../../core/services/sale-print.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/** Sentinel values used as `mat-option` values in the Customer autocomplete, alongside
 *  real `Customer` objects. Never sent to the backend as-is. */
const WALK_IN = "__WALK_IN__";
const ADD_NEW_CUSTOMER = "__ADD_NEW_CUSTOMER__";
type CustomerOptionValue = Customer | typeof WALK_IN | typeof ADD_NEW_CUSTOMER;

type SaleLine = SaleItem & {
  productName: string;
  packageName: string;
  packageKey: string;
  baseQuantity: number;
  /** Base units consumed per 1 unit of this packaging - used to recompute baseQuantity when qty changes. */
  baseUnitsPerQty: number;
  productImagePath?: string;
  batchNumber?: string;
};

@Component({
  selector: "app-sale-form",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatChipsModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
  templateUrl: "./sale-form.component.html",
  styleUrl: "./sale-form.component.scss",
})
export class SaleFormComponent implements OnInit, AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly messageDialog = inject(MessageDialogService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly liveUpdates = inject(LiveUpdatesService);
  private readonly salePrint = inject(SalePrintService);
  private readonly destroyRef = inject(DestroyRef);

  products: ProductStockListItem[] = [];
  private saleWarehouseId: number | null = null;
  /**
   * Every sellable batch currently in inventory, unfiltered — used only to
   * work out which Companies / Dosage Forms actually have stock (optionally
   * narrowed to the typed generic name) and to power the Generic Name
   * autocomplete. `products` above stays the filtered list that drives the
   * reference cards themselves.
   */
  allStocks: ProductStockListItem[] = [];
  customers: Customer[] = [];
  readonly WALK_IN = WALK_IN;
  readonly ADD_NEW_CUSTOMER = ADD_NEW_CUSTOMER;

  // ── Customer field (type-to-search + inline "add new customer") ───────────
  readonly customerSearchControl = new FormControl<string>("Walk-in", { nonNullable: true });
  /** Mirrors the literal text currently in the box, updated on every keystroke via (input).
   *  Kept separate from customerSearchControl's own value because Material overwrites that
   *  with the raw selected option (a Customer object or a sentinel) once one is picked. */
  private typedTerm = "Walk-in";
  private lastConfirmedDisplayText = "Walk-in";
  private lastConfirmedValue: CustomerOptionValue = WALK_IN;
  /** The backend requires a CustomerTypeId when creating a customer inline; "Retail" (or the first type) is used. */
  private defaultCustomerTypeId: number | null = null;

  showAddCustomerPhone = false;
  savingNewCustomer = false;
  newCustomerError: string | null = null;
  duplicateCustomerMatch: Customer | null = null;
  readonly customerPhoneControl = new FormControl<string>("", {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\+?[0-9]{6,15}$/)],
  });

  private get searchTerm(): string {
    // While the box still shows the confirmed selection untouched, treat it as "no search" so
    // opening the panel shows every customer rather than filtering down to just that one match.
    return this.typedTerm === this.lastConfirmedDisplayText ? "" : this.typedTerm;
  }

  get customerOptions(): Customer[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.customers;
    return this.customers.filter(
      (c) =>
        `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(term) ||
        (c.phone ?? "").toLowerCase().includes(term),
    );
  }

  get showAddNewCustomerOption(): boolean {
    return this.searchTerm.trim().length > 0;
  }

  customerDisplayFn = (value: CustomerOptionValue | null): string => {
    if (!value) return "";
    if (value === WALK_IN) return "Walk-in";
    if (value === ADD_NEW_CUSTOMER) return this.typedTerm;
    return [value.firstName, value.lastName].filter(Boolean).join(" ") + (value.phone ? ` · ${value.phone}` : "");
  };

  paymentMethods: PaymentMethod[] = [];
  prescriptions: Prescription[] = [];
  selectedPrescriptionId: number | null = null;
  items: SaleLine[] = [];
  saving = false;

  /** Id of the product currently shown in the "selected product" preview panel. */
  previewProductId: number | null = null;

  // "Search product name" was removed in an earlier pass and replaced by a
  // Generic-Name-only field — but that meant a cashier could no longer look
  // a brand up by its own name, only by generic. This field now matches
  // EITHER the brand/product name OR the generic name (server-side Contains
  // match), so searching "Napa" finds that brand directly if it's in stock,
  // and searching "Paracetamol" surfaces every brand that shares that
  // generic — the exact "customer wants Napa, we're out, but we carry
  // another Paracetamol brand" workflow.
  readonly filterForm = this.fb.nonNullable.group({
    companyId: [null as number | null],
    dosageFormId: [null as number | null],
    strength: [null as string | null],
    search: [""],
  });

  readonly barcodeControl = new FormControl<string>("", { nonNullable: true });
  scanningBarcode = false;

  /**
   * Batches pulled in by a barcode scan rather than by the filter form.
   * refreshSellableStocks() replaces `products` wholesale, which would
   * otherwise drop a scanned item's card (and with it the stock ceiling
   * that setQty() enforces), so they're kept here and merged back in.
   */
  private scannedStocks: ProductStockListItem[] = [];

  readonly saleForm = this.fb.group({
    customerId: [null as number | null],
    requiresPrescription: [false],
  });

  ngOnInit(): void {
    this.loadAllStocks();
    // Keep the stock picker current across cashier/admin/manager sessions,
    // while leaving the cashier's in-progress cart and checkout untouched.
    this.liveUpdates.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ resource }) => {
        if (["productstocks", "purchaseinvoices", "purchasereturns", "stocktransfers", "sales", "salereturns", "expiredproductstocks", "damagedproducts", "damage"].includes(resource.toLowerCase())) {
          this.loadAllStocks(true);
        }
      });
    this.api.getCustomers().subscribe((c) => (this.customers = c));
    this.loadPaymentMethods();
    this.api.getCustomerTypes().subscribe({
      next: (types) => {
        const retail = types.find((t) => t.name?.toLowerCase() === "retail");
        this.defaultCustomerTypeId = (retail ?? types[0])?.id ?? null;
      },
    });

    // Debounced so typing a search term doesn't fire a request per
    // keystroke; company/dosage/strength changes are already discrete
    // selections so they refresh immediately.
    this.filterForm.valueChanges
      .pipe(debounceTime(250))
      .subscribe(() => this.refreshSellableStocks());

    // Typing/selecting a search term narrows the Company/Dosage
    // Form/Strength dropdowns to only what's actually in stock for that
    // match — reset any of them if it no longer applies once the search
    // term changes.
    this.filterForm.controls.search.valueChanges.subscribe(() => {
      const companyId = this.filterForm.controls.companyId.value;
      if (companyId && !this.companyOptions.some((c) => c.id === companyId)) {
        this.filterForm.controls.companyId.setValue(null, { emitEvent: false });
      }
      const dosageFormId = this.filterForm.controls.dosageFormId.value;
      if (
        dosageFormId &&
        !this.dosageFormOptions.some((d) => d.id === dosageFormId)
      ) {
        this.filterForm.controls.dosageFormId.setValue(null, { emitEvent: false });
      }
      const strength = this.filterForm.controls.strength.value;
      if (strength && !this.strengthOptions.includes(strength)) {
        this.filterForm.controls.strength.setValue(null, { emitEvent: false });
      }
    });

    this.saleForm.controls.customerId.valueChanges.subscribe((id) =>
      this.loadPrescriptionsForCustomer(id),
    );
  }

  /** Keeps the raw typed text in sync with the box's actual content on every keystroke —
   *  see the comment on `typedTerm` for why this can't just read customerSearchControl.value. */
  onCustomerInput(event: Event): void {
    this.typedTerm = (event.target as HTMLInputElement).value;
  }

  onCustomerOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as CustomerOptionValue;
    if (value === WALK_IN) {
      this.selectWalkIn();
    } else if (value === ADD_NEW_CUSTOMER) {
      this.beginAddNewCustomer();
    } else {
      this.selectExistingCustomer(value);
    }
  }

  private selectWalkIn(): void {
    this.saleForm.controls.customerId.setValue(null);
    this.confirmSelection(WALK_IN, "Walk-in");
  }

  private selectExistingCustomer(customer: Customer): void {
    this.saleForm.controls.customerId.setValue(customer.customerId);
    this.confirmSelection(customer, this.customerDisplayFn(customer));
  }

  private confirmSelection(value: CustomerOptionValue, displayText: string): void {
    this.lastConfirmedValue = value;
    this.lastConfirmedDisplayText = displayText;
    this.typedTerm = displayText;
    this.customerSearchControl.setValue(value as any, { emitEvent: false });
    this.showAddCustomerPhone = false;
    this.duplicateCustomerMatch = null;
    this.newCustomerError = null;
  }

  /** Selecting "Add '<name>' as new customer" reveals just a phone field inline — the name was
   *  already typed, so only the phone number (required to trace due payments later) is missing. */
  private beginAddNewCustomer(): void {
    this.showAddCustomerPhone = true;
    this.duplicateCustomerMatch = null;
    this.newCustomerError = null;
    this.customerPhoneControl.reset("");
  }

  cancelAddNewCustomer(): void {
    this.showAddCustomerPhone = false;
    this.duplicateCustomerMatch = null;
    this.newCustomerError = null;
    this.typedTerm = this.lastConfirmedDisplayText;
    this.customerSearchControl.setValue(this.lastConfirmedValue as any, { emitEvent: false });
  }

  /** The typed phone already belongs to a saved customer — use them instead of creating a duplicate. */
  useDuplicateCustomer(): void {
    const match = this.duplicateCustomerMatch;
    if (match) this.selectExistingCustomer(match);
  }

  saveNewCustomer(): void {
    if (this.savingNewCustomer) return;
    const phone = (this.customerPhoneControl.value ?? "").replace(/[\s\-()]/g, "");
    this.customerPhoneControl.setValue(phone, { emitEvent: false });
    if (this.customerPhoneControl.invalid) {
      this.customerPhoneControl.markAsTouched();
      return;
    }
    if (this.defaultCustomerTypeId === null) {
      this.newCustomerError = "No customer type is set up yet. Add one under Customer Types first.";
      return;
    }

    const existingMatch = this.customers.find((c) => (c.phone ?? "").replace(/[\s\-()]/g, "") === phone);
    if (existingMatch) {
      this.duplicateCustomerMatch = existingMatch;
      return;
    }

    const name = this.pendingCustomerName.trim();
    const [firstName, ...rest] = name.split(/\s+/);

    this.savingNewCustomer = true;
    this.newCustomerError = null;
    this.api
      .createCustomer({
        firstName,
        lastName: rest.join(" "),
        phone,
        customerTypeId: this.defaultCustomerTypeId,
        creditLimit: 0,
        isActive: true,
      })
      .subscribe({
        next: (customer) => {
          this.savingNewCustomer = false;
          if (!this.customers.some((c) => c.customerId === customer.customerId)) {
            this.customers = [...this.customers, customer];
          }
          this.selectExistingCustomer(customer);
        },
        error: (e) => {
          this.savingNewCustomer = false;
          this.newCustomerError = e?.error?.message || "Could not create the customer.";
        },
      });
  }

  /** The name half of the pending new customer — whatever was typed into the box before
   *  "Add as new customer" was picked. */
  get pendingCustomerName(): string {
    return this.typedTerm.trim();
  }

  /** If the user types something and clicks away without picking an option (or without
   *  finishing the add-new-customer step), snap the box back to the last real selection. */
  onCustomerSearchBlur(): void {
    if (this.showAddCustomerPhone) return;
    setTimeout(() => {
      if (this.showAddCustomerPhone) return;   // ⬅️ এই লাইনটা নতুন যোগ হয়েছে
      if (this.typedTerm !== this.lastConfirmedDisplayText) {
        this.messageDialog.warning(
          `"${this.typedTerm}" was not selected from the list, so this sale will be recorded for ${this.lastConfirmedDisplayText}. Pick a name from the dropdown (or "Add as new customer") to change it.`,
        );
        this.typedTerm = this.lastConfirmedDisplayText;
        this.customerSearchControl.setValue(this.lastConfirmedValue as any, { emitEvent: false });
      }
    }, 150);
  }

  @ViewChild("scanInput") scanInput?: ElementRef<HTMLInputElement>;
  ngAfterViewInit(): void { this.scanInput?.nativeElement.focus(); }

  /** Loads the full, unfiltered sellable-stock list once, purely to derive
   *  the search suggestions and the inventory-driven Company/Dosage
   *  Form/Strength dropdown options below. */
  loadAllStocks(refreshVisibleProducts = false): void {
    this.api.getWarehousesFull().subscribe({
      next: (warehouses) => {
        const mainWarehouses = warehouses.filter(
          (warehouse: WarehouseFull) => warehouse.isActive && warehouse.warehouseTypeName?.trim().toLocaleLowerCase() === "main",
        );
        const selectedMainWarehouse =
          mainWarehouses.find((warehouse) => warehouse.name.trim().toLocaleLowerCase() === "main warehouse") ??
          (mainWarehouses.length === 1 ? mainWarehouses[0] : undefined);
        if (!selectedMainWarehouse) {
          this.allStocks = [];
          this.messageDialog.error(
            mainWarehouses.length === 0
              ? "No active Main warehouse is configured, so sales cannot load stock."
              : "Multiple Main warehouses are configured and there is no active warehouse named 'Main Warehouse'. Rename the intended sales warehouse so sales use the correct stock location.",
          );
          return;
        }

        this.saleWarehouseId = selectedMainWarehouse.id;
        this.api.getSellableStocks({ warehouseId: this.saleWarehouseId }).subscribe({
          next: (stocks) => {
            this.allStocks = stocks;
            if (!refreshVisibleProducts) return;

            // Refresh scanned batch cards from the latest inventory snapshot;
            // discard batches that are no longer sellable. Cart lines remain
            // intact, so the live refresh never loses the current sale.
            const currentStocksById = new Map(stocks.map((stock) => [stock.id, stock]));
            this.scannedStocks = this.scannedStocks
              .map((stock) => currentStocksById.get(stock.id))
              .filter((stock): stock is ProductStockListItem => !!stock);
            this.refreshSellableStocks();
          },
          error: () => (this.allStocks = []),
        });
      },
      error: () => {
        this.allStocks = [];
        this.messageDialog.error("Could not identify the Main warehouse. Please confirm the backend is running.");
      },
    });
  }

  /** Sorted, de-duplicated brand + generic names for the autocomplete
   *  panel, narrowed to what's typed so far. Brand names first (an exact
   *  brand hit is what most searches want), then generic names — capped so
   *  the panel doesn't get unwieldy. */
  searchSuggestions(typed: string): string[] {
    const term = typed.trim().toLocaleLowerCase();
    if (!term) return [];
    const brandNames = [...new Set(this.allStocks.map((s) => s.productName))];
    const genericNames = [
      ...new Set(
        this.allStocks.map((s) => s.genericName).filter((g): g is string => !!g),
      ),
    ];
    const matches = (names: string[]) =>
      names.filter((n) => n.toLocaleLowerCase().includes(term)).sort();
    return [...matches(brandNames), ...matches(genericNames)]
      .filter((name, i, arr) => arr.indexOf(name) === i)
      .slice(0, 25);
  }

  selectSearchTerm(event: MatAutocompleteSelectedEvent): void {
    this.filterForm.controls.search.setValue(event.option.value);
  }

  /** A stock "matches" the current search term if its brand name OR its
   *  generic name contains it — mirrors the backend's Contains match, used
   *  here purely to derive dropdown options from the already-loaded
   *  allStocks without another round trip. */
  private matchesSearch(stock: ProductStockListItem, term: string): boolean {
    if (!term) return true;
    return (
      stock.productName.toLocaleLowerCase().includes(term) ||
      !!stock.genericName?.toLocaleLowerCase().includes(term)
    );
  }

  private stocksMatchingSearch(): ProductStockListItem[] {
    const term = this.filterForm.controls.search.value.trim().toLocaleLowerCase();
    return this.allStocks.filter((s) => this.matchesSearch(s, term));
  }

  /** Companies that actually have inventory — narrowed to the current
   *  search term when one is set, otherwise every company with stock. */
  get companyOptions(): Company[] {
    const source = this.stocksMatchingSearch();
    const map = new Map<number, Company>();
    for (const s of source) {
      const id = (s as any).companyId as number | undefined;
      if (id && s.companyName && !map.has(id)) {
        map.set(id, { id, name: s.companyName, isActive: true, productCount: 0 });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Dosage forms that actually have inventory — same narrowing as
   *  companyOptions above. */
  get dosageFormOptions(): DosageForm[] {
    const source = this.stocksMatchingSearch();
    const map = new Map<number, DosageForm>();
    for (const s of source) {
      const id = (s as any).dosageFormId as number | undefined;
      if (id && s.dosageFormName && !map.has(id)) {
        map.set(id, { id, name: s.dosageFormName, productCount: 0 });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Strengths that actually have inventory — same narrowing again. This is
   *  what lets typing "Paracetamol" auto-populate "500mg", "650mg", etc.
   *  with only the strengths you actually stock. */
  get strengthOptions(): string[] {
    const source = this.stocksMatchingSearch();
    return [...new Set(source.map((s) => s.strength).filter((s): s is string => !!s))].sort();
  }

  loadPrescriptionsForCustomer(customerId: number | null): void {
    this.selectedPrescriptionId = null;
    if (!customerId) {
      this.prescriptions = [];
      return;
    }
    this.api.getPrescriptions({ customerId }).subscribe({
      next: (list) => (this.prescriptions = list.filter((p) => !p.saleId)),
      error: () => (this.prescriptions = []),
    });
  }

  get cartNeedsPrescription(): boolean {
    return this.items.some((i) => {
      const product = this.products.find((p) => p.id === i.productStockId);
      return product?.requiresPrescription === true;
    });
  }

  get selectedPrescription(): Prescription | undefined {
    return this.prescriptions.find(
      (p) => p.prescriptionId === this.selectedPrescriptionId,
    );
  }

  loadPaymentMethods(): void {
    this.paymentMethodService.getAll().subscribe({
      next: (methods) => {
        this.paymentMethods = methods.filter((m) => m.isActive);
      },
      error: () =>
        this.messageDialog.error(
          "Could not load payment methods. Please confirm the backend is running.",
        ),
    });
  }

  /**
   * Company/Dosage Form/Strength are sent to the backend as exact filters
   * (they're pick-from-a-list fields either way). Search is sent as-is too
   * — the backend now does a Contains match against brand name AND generic
   * name, so this one field covers both "find this exact brand" and "find
   * every brand that shares this generic" without going empty mid-type the
   * way an exact-match filter would.
   */
  refreshSellableStocks(): void {
    const f = this.filterForm.getRawValue();
    const hasFilter = !!(f.search?.trim() || f.companyId || f.dosageFormId || f.strength);

    if (this.saleWarehouseId === null) {
      this.products = [];
      return;
    }

    // Nothing searched/selected yet — show an empty "Add Items" table
    // instead of dumping the full sellable-stock list on page load.
    if (!hasFilter) {
      this.products = [];
      this.mergeScannedIntoProducts();
      return;
    }

    this.api
      .getSellableStocks({
        warehouseId: this.saleWarehouseId ?? undefined,
        search: f.search || undefined,
        companyId: f.companyId || undefined,
        dosageFormId: f.dosageFormId || undefined,
        strength: f.strength || undefined,
      })
      .subscribe({
        next: (stocks) => {
          this.products = stocks;
          this.mergeScannedIntoProducts();
        },
        error: () =>
          this.messageDialog.error(
            "Could not refresh sellable stock. Please confirm the backend is running.",
          ),
      });
  }

  clearFilters(): void {
    this.scannedStocks = [];
    this.filterForm.reset({
      companyId: null,
      dosageFormId: null,
      strength: null,
      search: "",
    });
  }

  /** Method pre-selected in the Confirm Sale dialog: "Cash" if active, else the first active one. */
  private get defaultPaymentMethod(): string {
    return (
      this.paymentMethods.find((m) => m.name === "Cash")?.name ??
      this.paymentMethods[0]?.name ??
      "Cash"
    );
  }

  get grandTotal(): number {
    return this.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  }

  /** Click-to-add: called when the user clicks a unit row in the product reference table. */
  addFromReference(product: ProductStockListItem, packaging: ProductPackaging): void {
    const packageKey = this.packageKey(packaging);
    this.previewProductId = product.id;

    const existingIndex = this.items.findIndex(
      (i) => i.productStockId === product.id && i.packageKey === packageKey,
    );
    if (existingIndex > -1) {
      this.setQty(existingIndex, this.items[existingIndex].quantity + 1);
      return;
    }

    const baseQuantity = packaging.baseQuantity;
    const alreadyInCart = this.items
      .filter((i) => i.productStockId === product.id)
      .reduce((sum, i) => sum + i.baseQuantity, 0);
    if (alreadyInCart + baseQuantity > product.availableQuantity) {
      this.messageDialog.warning(
        `Only ${product.availableQuantity} ${product.unitName} remain in this batch.`,
      );
      return;
    }

    this.items.push({
      productStockId: product.id,
      unitId: packaging.unitId,
      quantity: 1,
      baseQuantity,
      baseUnitsPerQty: packaging.baseQuantity,
      unitPrice: packaging.perUnitPrice,
      productName: product.productName,
      packageName: this.packagingLabel(packaging),
      packageKey,
      productImagePath: product.productImagePath,
      batchNumber: product.batchNumber,
    });
  }

  /**
   * Barcode → product → its sellable batches → cart, using the dedicated
   * /products/by-barcode endpoint. FEFO: the earliest-expiring batch with
   * stock is the one added, matching what the reference cards default to.
   */
  scanBarcode(): void {
    const code = this.barcodeControl.value.trim();
    if (!code || this.scanningBarcode) return;
    if (this.saleWarehouseId === null) {
      this.messageDialog.warning("Sales are unavailable until an active Main warehouse is configured.");
      return;
    }

    this.scanningBarcode = true;

    this.api
      .getProductByBarcode(code)
      .pipe(
        switchMap((product) =>
          this.api
            .getSellableStocks({ productId: product.id, warehouseId: this.saleWarehouseId ?? undefined })
            .pipe(map((stocks) => ({ product, stocks: stocks.filter((stock) => stock.productId === product.id) }))),
        ),
      )
      .subscribe({
        next: ({ product, stocks }) => {
          this.scanningBarcode = false;
          this.barcodeControl.setValue("");

          if (!stocks.length) {
            this.messageDialog.warning(
              `"${product.productName}" scanned, but no unexpired batch with stock is available to sell.`,
            );
            return;
          }

          // getSellableStocks already returns FEFO order within a product,
          // but sort defensively so this doesn't depend on server ordering.
          const batches = [...stocks].sort(
            (a, b) =>
              new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
          );

          this.rememberScanned(batches);

          // Respect an explicit batch override if the cashier already picked
          // one for this product; otherwise FEFO.
          const batch = this.activeBatch({
            productId: batches[0].productId,
            batches,
          });

          // availablePackages()[0] is always the product's base unit.
          this.addFromReference(batch, this.availablePackages(batch)[0]);
        },
        error: () => {
          // The 404's message ("No product found with barcode ...") is
          // already shown by errorInterceptor.
          this.scanningBarcode = false;
          this.barcodeControl.setValue("");
        },
      });
  }

  /** Keeps scanned batches visible in `products` across filter refreshes. */
  private rememberScanned(batches: ProductStockListItem[]): void {
    for (const b of batches) {
      if (!this.scannedStocks.some((s) => s.id === b.id)) this.scannedStocks.push(b);
    }
    this.mergeScannedIntoProducts();
  }

  private mergeScannedIntoProducts(): void {
    const missing = this.scannedStocks.filter(
      (s) => !this.products.some((p) => p.id === s.id),
    );
    if (missing.length) this.products = [...this.products, ...missing];
  }

  /** Increase/decrease the quantity of an existing line item (e.g. from +/- buttons). */
  changeQty(index: number, delta: number): void {
    const line = this.items[index];
    if (!line) return;
    this.setQty(index, line.quantity + delta);
  }

  /** Directly set the quantity of an existing line item (e.g. from a typed value), validating stock. */
  setQty(index: number, newQty: number): void {
    const line = this.items[index];
    if (!line) return;

    if (newQty < 1) {
      this.removeItem(index);
      return;
    }

    const product = this.products.find((p) => p.id === line.productStockId);
    const newBaseQuantity = newQty * line.baseUnitsPerQty;
    const otherLinesBase = this.items
      .filter((i, idx) => idx !== index && i.productStockId === line.productStockId)
      .reduce((sum, i) => sum + i.baseQuantity, 0);

    if (product && otherLinesBase + newBaseQuantity > product.availableQuantity) {
      this.messageDialog.warning(
        `Only ${product.availableQuantity} ${product.unitName} remain in this batch.`,
      );
      return;
    }

    line.quantity = newQty;
    line.baseQuantity = newBaseQuantity;
  }

  onQtyInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (!value || value < 1) {
      input.value = String(this.items[index]?.quantity ?? 1);
      return;
    }
    this.setQty(index, value);
  }

  availablePackages(product?: ProductStockListItem): ProductPackaging[] {
    if (!product) return [];
    return [
      {
        unitId: product.unitId,
        unitName: product.unitName,
        displayName: product.unitName,
        perUnitPrice: product.salePrice,
        baseQuantity: 1,
      },
      ...(product.packagings || []),
    ];
  }

  get selectedProduct(): ProductStockListItem | undefined {
    return this.products.find((product) => product.id === this.previewProductId);
  }
  get selectedPackages(): ProductPackaging[] {
    return this.availablePackages(this.selectedProduct);
  }
  get alternativePackagings(): ProductPackaging[] {
    return this.selectedPackages.filter((p) => this.packageKey(p) !== "base");
  }
  packageKey(pack: ProductPackaging): string {
    return pack.id ? `pack-${pack.id}` : "base";
  }
  packagingLabel(pack: ProductPackaging): string {
    return (
      pack.displayName?.trim() ||
      `${pack.baseQuantity} ${pack.unitName || "pack"}`
    );
  }
  imageUrl(path?: string): string | null {
    return this.api.assetUrl(path);
  }

  /** Flags a batch expiring within 90 days, so the reference card can call
   *  it out visually — useful even outside pure FEFO ordering, since a
   *  near-expiry batch on a slow-moving product deserves attention. */
  isExpiringSoon(product: ProductStockListItem): boolean {
    const days = (new Date(product.expiryDate).getTime() - Date.now()) / 86_400_000;
    return days <= 90;
  }

  /** True once a batch's expiry date is in the past — shown in red and
   *  should normally never be sellable, but still flagged defensively in
   *  case a stale batch briefly shows up in the reference list. */
  isExpired(product: ProductStockListItem): boolean {
    return new Date(product.expiryDate).getTime() < Date.now();
  }

  /** Low-stock flag for the "Stock (base unit)" figure on the reference
   *  card — anything at or below 10 base units is called out in amber so
   *  a cashier notices before promising more than is actually on hand. */
  isLowStock(product: ProductStockListItem): boolean {
    return product.availableQuantity > 0 && product.availableQuantity <= 10;
  }

  // ---- FEFO: group the flat batch list into one card per product ----

  /** Per-product card for the reference list — `batches` is every batch of
   *  this product currently in stock, sorted soonest-to-expire first, so
   *  `batches[0]` is always the FEFO-correct default. Grouping like this
   *  (instead of one card per batch, as before) is what stops a cashier
   *  from being shown two cards for the same product and picking the
   *  later-expiring one by accident. */
  get referenceCards(): { productId: number; batches: ProductStockListItem[] }[] {
    const map = new Map<number, ProductStockListItem[]>();
    for (const p of this.products) {
      const list = map.get(p.productId);
      if (list) list.push(p);
      else map.set(p.productId, [p]);
    }
    return [...map.entries()].map(([productId, batches]) => ({
      productId,
      batches: [...batches].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
      ),
    }));
  }

  /** Which batch of this card is currently shown/being sold from — defaults
   *  to the earliest-expiring one (FEFO) unless the cashier has explicitly
   *  overridden it via chooseBatch() below (e.g. to clear older stock that
   *  actually expires later due to a data-entry correction). */
  private selectedBatchByProduct: Record<number, number> = {};

  activeBatch(card: { productId: number; batches: ProductStockListItem[] }): ProductStockListItem {
    const chosenId = this.selectedBatchByProduct[card.productId];
    return card.batches.find((b) => b.id === chosenId) ?? card.batches[0];
  }

  chooseBatch(productId: number, stockId: number): void {
    this.selectedBatchByProduct[productId] = stockId;
    if (this.previewProductId && this.products.find((p) => p.id === this.previewProductId)?.productId === productId) {
      this.previewProductId = stockId;
    }
  }

  get sameGenericProducts(): ProductStockListItem[] {
    const generic = this.selectedProduct?.genericName;
    if (!generic) return [];
    const matches = this.products.filter((p) => p.genericName === generic);
    // FEFO: when a product has several batches in stock, represent it by
    // its earliest-expiring batch here too, so "Also available as" / the
    // Alternate Brands dialog never points a cashier at a later-expiring
    // batch of a brand that has an earlier one still in stock.
    const byProduct = new Map<number, ProductStockListItem>();
    for (const p of matches) {
      const existing = byProduct.get(p.productId);
      if (!existing || new Date(p.expiryDate) < new Date(existing.expiryDate))
        byProduct.set(p.productId, p);
    }
    return [...byProduct.values()];
  }

  get alsoAvailableAs(): ProductStockListItem[] {
    return this.sameGenericProducts.filter(
      (p) => p.productId !== this.selectedProduct?.productId,
    );
  }

  selectStockItem(item: ProductStockListItem): void {
    this.previewProductId = item.id;
  }

  openAlternateBrands(): void {
    const generic = this.selectedProduct?.genericName;
    if (!generic) return;
    const ref = this.dialog.open(AlternateBrandsDialogComponent, {
      width: "960px",
      maxWidth: "95vw",
      enterAnimationDuration: "0ms",
      data: { genericName: generic, products: this.sameGenericProducts },
    });
    ref.afterClosed().subscribe((result) => {
      if (result) this.selectStockItem(result);
    });
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
  }

  /** Opens the "Confirm sale" popup, then completes the sale with the values chosen there. */
  openConfirmSaleDialog(): void {
    if (this.items.length === 0) return;

    if (
      this.saleForm.controls.requiresPrescription.value &&
      !this.selectedPrescriptionId
    ) {
      this.messageDialog.warning("Select a prescription for this sale, or turn the toggle off.");
      return;
    }

    const ref = this.dialog.open(ConfirmSaleDialogComponent, {
      width: "480px",
      maxWidth: "95vw",
      enterAnimationDuration: "0ms",
      data: {
        paymentMethods: this.paymentMethods,
        paymentMethod: this.defaultPaymentMethod,
        subtotal: this.grandTotal,
        customerSelected: !!this.saleForm.controls.customerId.value,
        items: this.items.map((i) => ({
          productName: i.productName,
          batchNumber: i.batchNumber,
          unitName: i.unitName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      } as ConfirmSaleDialogData,
    });

    ref.afterClosed().subscribe((result?: ConfirmSaleResult) => {
      if (!result) return;

      // Safety net (the dialog already blocks this): a due sale needs a customer.
      if (!result.isPaid && !this.saleForm.controls.customerId.value) {
        this.messageDialog.warning(
          "Select a customer before creating a due sale. Walk-in sales must be paid immediately.",
        );
        return;
      }

      this.completeSale(result);
    });
  }

  private completeSale(result: ConfirmSaleResult): void {
    this.saving = true;
    const payload = {
      customerId: this.saleForm.controls.customerId.value,
      paymentMethod: result.paymentMethod,
      isPaid: result.isPaid,
      discount: result.discount,
      termsAndConditions: result.termsAndConditions,
      requiresPrescription: this.saleForm.controls.requiresPrescription.value!,
      prescriptionId: this.selectedPrescriptionId,
      items: this.items.map(
        ({ productStockId, unitId, quantity, unitPrice }) => ({
          productStockId,
          unitId,
          quantity,
          unitPrice,
        }),
      ),
    };

    this.api.createSale(payload as any).subscribe({
      next: (sale) => {
        const partialAmount = !result.isPaid ? result.amountPaid : 0;
        if (partialAmount > 0) {
          this.api
            .recordSalePayment(sale.saleId, result.paymentMethod as any, partialAmount)
            .subscribe({
              next: (updatedSale) => this.finishSale(updatedSale, result),
              error: (e) => {
                this.messageDialog.error(
                  e.error?.message ||
                  "Sale was created, but recording the partial payment failed. Record it manually from the sale.",
                );
                this.finishSale(sale, result);
              },
            });
        } else {
          this.finishSale(sale, result);
        }
      },
      error: (e) => {
        this.saving = false;
        result.printWindow?.close();
        this.messageDialog.error(e.error?.message || "Could not complete sale.");
      },
    });
  }

  private finishSale(sale: Sale, result: ConfirmSaleResult): void {
    this.saving = false;
    this.api.getSale(sale.saleId).subscribe({
      next: (completeSale) => this.openInvoiceAndReturn(completeSale, result),
      error: () => this.openInvoiceAndReturn(sale, result),
    });
  }

  private openInvoiceAndReturn(sale: Sale, result: ConfirmSaleResult): void {
    this.salePrint.print(sale, undefined, result.printWindow);
    this.router.navigate(["/sales"]);
  }
}
