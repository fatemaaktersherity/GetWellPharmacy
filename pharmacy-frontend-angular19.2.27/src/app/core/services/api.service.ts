import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { UserProfile } from '../models/auth.model';
import {
  Product, ProductCreate, ProductPriceHistory,
  Sale, SaleCreate,
  PurchaseInvoice, DailyPurchaseRequirement,
  Supplier, SupplierType, Customer, CustomerAddress, CustomerAddressWrite,
  Warehouse, ProductStock, ProductStockWrite, ExpiredProductStock, ExpiredProductStockCreate, ExpiredProductStockRead,
  Employee, EmployeeDocument, EmployeeDocumentWrite, Department,
  ChartOfAccount, CompanyAsset, CompanyAssetCreate, CompanyLiability, CompanyLiabilityCreate, LedgerAccount, JournalEntryCreate,
  Unit, UnitWrite,
  PurchaseReturn, PurchaseReturnCreate, PurchaseReturnUpdate,
  SaleReturn, SaleReturnCreate, SaleReturnUpdate,
  ProductStockListItem,
  Company, CompanyDivision, ProductCategory, DosageForm, ProductBrandListItem, BrandType, ProductFilterOptions,
  SupplierProduct, SupplierProductWrite, EffectiveUnitPrice,
  ProductGroup, ProductGroupDetail, ProductGroupWrite, ProductVariant, ProductVariantWrite,
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrderItemWrite,
  PurchaseOrderUpdate,
  Doctor,
  DoctorWrite,
  Prescription,
  PrescriptionCreate,
  PrescriptionUpdate,
  WarehouseFull,
  WarehouseType,
  WarehouseWrite,
  ProductRakItem, ProductRakWrite, StockTransfer, StockTransferCreate,
  SmsLog,
  PaymentMethod,
  ActivityLog,
  SmsLogCreate,
  SmsLogPurgeResult,
  CompanyAssetDetail,
  CompanyLiabilityDetail,
  ProductDetailInfo,
  ProductDetailsWrite,
  ProductPackaging,
  ProductPackagingWrite,
  SupplierPayment,
  SupplierPaymentCreate,
  SupplierPaymentUpdate,
  SupplierPaymentDetailWrite,
  SupplierContactWrite,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /** Converts an API-supplied relative image path into a browser URL. */
  assetUrl(path?: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
    return this.baseUrl.replace(/\/api$/, '') + (path.startsWith('/') ? path : `/${path}`);
  }

  // -- Admin: users and roles ------------------------------------------------
  getUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${this.baseUrl}/users`);
  }

  changeUserRole(userId: number, newRoleName: 'Admin' | 'Manager' | 'Cashier'): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/users/${userId}/role`, { newRoleName });
  }

  setUserActive(userId: number, isActive: boolean): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/users/${userId}/status`, isActive);
  }

  resetUserPassword(userId: number, newPassword: string, confirmNewPassword: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/users/${userId}/reset-password`, {
      newPassword,
      confirmNewPassword
    });
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  getUnits(): Observable<Unit[]> {
    return this.http.get<any[]>(`${this.baseUrl}/units`).pipe(
      map(items => items.map(i => ({
        unitId: i.id ?? i.unitId,
        unitName: i.name ?? i.unitName,
        unitSymbol: i.unitSymbol
      }) as Unit))
    );
  }

  createUnit(unit: UnitWrite): Observable<Unit> {
    return this.http.post<any>(`${this.baseUrl}/units`, unit).pipe(map(i => ({
      unitId: i.id ?? i.unitId,
      unitName: i.name ?? i.unitName,
      unitSymbol: i.unitSymbol
    }) as Unit));
  }

  updateUnit(id: number, unit: UnitWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/units/${id}`, unit);
  }

  deleteUnit(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/units/${id}`);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  // Backs the Brand Search page and (now) the Company → Products drill-down.
  // Kept backward-compatible: existing call sites passing a plain string
  // (getProducts('napa')) keep working unchanged.
  getProducts(search?: string): Observable<Product[]>;
  getProducts(filters: {
    search?: string;
    companyId?: number;
    dosageFormId?: number;
    strength?: string;
    brandType?: string;
    page?: number;
    pageSize?: number;
  }): Observable<Product[]>;
  getProducts(arg?: string | {
    search?: string; companyId?: number; dosageFormId?: number;
    strength?: string; brandType?: string; page?: number; pageSize?: number;
  }): Observable<Product[]> {
    const filters = typeof arg === 'string' ? { search: arg } : (arg ?? {});
    let params = new HttpParams();
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters.companyId) params = params.set('companyId', filters.companyId);
    if (filters.dosageFormId) params = params.set('dosageFormId', filters.dosageFormId);
    if (filters.strength?.trim()) params = params.set('strength', filters.strength.trim());
    if (filters.brandType) params = params.set('brandType', filters.brandType);
    params = params.set('page', filters.page ?? 1);
    params = params.set('pageSize', filters.pageSize ?? 200); // generous default so a "show all" drill-down isn't silently truncated at 20
    return this.http.get<Product[]>(`${this.baseUrl}/products`, { params });
  }

  // Brand Search (P2) — search by brand OR generic name, filter by
  // Company / Strength / Dosage form / Brand type, same as medex.com.bd's brand page.
  searchProductBrands(opts: { search?: string; companyId?: number; dosageFormId?: number; strength?: string; brandType?: BrandType; page?: number; pageSize?: number }): Observable<Product[]> {
    let params = new HttpParams();
    if (opts.search?.trim()) params = params.set('search', opts.search.trim());
    if (opts.companyId) params = params.set('companyId', opts.companyId.toString());
    if (opts.dosageFormId) params = params.set('dosageFormId', opts.dosageFormId.toString());
    if (opts.strength?.trim()) params = params.set('strength', opts.strength.trim());
    if (opts.brandType) params = params.set('brandType', opts.brandType);
    if (opts.page) params = params.set('page', opts.page.toString());
    if (opts.pageSize) params = params.set('pageSize', opts.pageSize.toString());
    return this.http.get<Product[]>(`${this.baseUrl}/products`, { params });
  }

  // Distinct strength values (e.g. "500mg") for the Brand Search page's
  // Strength dropdown — a picklist instead of a free-text box, narrowed by
  // whatever other filters are already active.
  getProductStrengths(opts: { search?: string; companyId?: number; dosageFormId?: number; brandType?: BrandType } = {}): Observable<string[]> {
    let params = new HttpParams();
    if (opts.search?.trim()) params = params.set('search', opts.search.trim());
    if (opts.companyId) params = params.set('companyId', opts.companyId.toString());
    if (opts.dosageFormId) params = params.set('dosageFormId', opts.dosageFormId.toString());
    if (opts.brandType) params = params.set('brandType', opts.brandType);
    return this.http.get<string[]>(`${this.baseUrl}/products/strengths`, { params });
  }

  // "List of Brand Names" (P3) — alphabetical, optionally jumped to a
  // letter and/or narrowed to Allopathic/Herbal.
  getBrandList(letter?: string, brandType?: BrandType, page = 1, pageSize = 60): Observable<ProductBrandListItem[]> {
    let params = new HttpParams().set('page', page.toString()).set('pageSize', pageSize.toString());
    if (letter) params = params.set('letter', letter);
    if (brandType) params = params.set('brandType', brandType);
    return this.http.get<ProductBrandListItem[]>(`${this.baseUrl}/products/brands`, { params });
  }

  // Auto-fill for a Purchase Invoice line: the right PurchasePrice/SalePrice
  // for this Product + Unit (+ Supplier if picked), never the flat master price.
  getEffectiveUnitPrice(productId: number, unitId: number, supplierId?: number): Observable<EffectiveUnitPrice> {
    let params = new HttpParams().set('unitId', unitId.toString());
    if (supplierId) params = params.set('supplierId', supplierId.toString());
    return this.http.get<EffectiveUnitPrice>(`${this.baseUrl}/products/${productId}/effective-price`, { params });
  }

  // ── Companies (Brand Search "Company" filter) ───────────────────────────────

  getCompanies(search?: string): Observable<Company[]> {
    let params = new HttpParams();
    if (search?.trim()) params = params.set('search', search.trim());
    return this.http.get<Company[]>(`${this.baseUrl}/companies`, { params });
  }

  getCompanyDivisions(companyId: number): Observable<CompanyDivision[]> {
    return this.http.get<CompanyDivision[]>(`${this.baseUrl}/companies/${companyId}/divisions`);
  }

  createCompanyDivision(companyId: number, name: string): Observable<CompanyDivision> {
    return this.http.post<CompanyDivision>(`${this.baseUrl}/companies/${companyId}/divisions`, { name });
  }

  updateCompanyDivision(companyId: number, divisionId: number, name: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/companies/${companyId}/divisions/${divisionId}`, { name });
  }

  deleteCompanyDivision(companyId: number, divisionId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/companies/${companyId}/divisions/${divisionId}`);
  }

  getProductCategories(): Observable<ProductCategory[]> {
    return this.http.get<ProductCategory[]>(`${this.baseUrl}/productcategories`);
  }

  createProductCategory(name: string, parentCategoryId?: number | null): Observable<ProductCategory> {
    return this.http.post<ProductCategory>(`${this.baseUrl}/productcategories`, { name, parentCategoryId: parentCategoryId ?? null });
  }

  updateProductCategory(id: number, name: string, parentCategoryId?: number | null): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/productcategories/${id}`, { name, parentCategoryId: parentCategoryId ?? null });
  }

  deleteProductCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/productcategories/${id}`);
  }

  createCompany(name: string): Observable<Company> {
    return this.http.post<Company>(`${this.baseUrl}/companies`, { name, isActive: true });
  }

  updateCompany(id: number, company: { name: string; isActive: boolean }): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/companies/${id}`, company);
  }

  deleteCompany(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/companies/${id}`);
  }

  // ── Dosage Forms (Brand Search "Dosage Form" filter) ────────────────────────

  getDosageForms(): Observable<DosageForm[]> {
    return this.http.get<DosageForm[]>(`${this.baseUrl}/dosageforms`);
  }

  createDosageForm(name: string): Observable<DosageForm> {
    return this.http.post<DosageForm>(`${this.baseUrl}/dosageforms`, { name });
  }

  // ── Product groups and their variants ────────────────────────────────────
  getProductGroups(): Observable<ProductGroup[]> { return this.http.get<ProductGroup[]>(`${this.baseUrl}/productgroups`); }
  getProductGroup(id: number): Observable<ProductGroupDetail> { return this.http.get<ProductGroupDetail>(`${this.baseUrl}/productgroups/${id}`); }
  createProductGroup(group: ProductGroupWrite): Observable<ProductGroup> { return this.http.post<ProductGroup>(`${this.baseUrl}/productgroups`, group); }
  updateProductGroup(id: number, group: ProductGroupWrite): Observable<void> { return this.http.put<void>(`${this.baseUrl}/productgroups/${id}`, group); }
  deleteProductGroup(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/productgroups/${id}`); }
  createProductVariant(groupId: number, variant: ProductVariantWrite): Observable<ProductVariant> { return this.http.post<ProductVariant>(`${this.baseUrl}/productgroups/${groupId}/variants`, variant); }
  updateProductVariant(groupId: number, id: number, variant: ProductVariantWrite): Observable<void> { return this.http.put<void>(`${this.baseUrl}/productgroups/${groupId}/variants/${id}`, variant); }
  deleteProductVariant(groupId: number, id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/productgroups/${groupId}/variants/${id}`); }

  updateDosageForm(id: number, name: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/dosageforms/${id}`, { name });
  }

  deleteDosageForm(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/dosageforms/${id}`);
  }

  // ── Supplier <-> Product (many-to-many, per-unit pricing) ───────────────────

  // Products belonging to a supplier (their catalogue / purchase history).
  getSupplierProductsBySupplier(supplierId: number, includeInactive = false): Observable<SupplierProduct[]> {
    let params = new HttpParams().set('supplierId', supplierId.toString()).set('includeInactive', includeInactive.toString());
    return this.http.get<SupplierProduct[]>(`${this.baseUrl}/supplierproducts`, { params });
  }

  // Suppliers a product can be bought from.
  getSupplierProductsByProduct(productId: number, includeInactive = false): Observable<SupplierProduct[]> {
    let params = new HttpParams().set('productId', productId.toString()).set('includeInactive', includeInactive.toString());
    return this.http.get<SupplierProduct[]>(`${this.baseUrl}/supplierproducts`, { params });
  }

  createSupplierProduct(link: SupplierProductWrite): Observable<SupplierProduct> {
    return this.http.post<SupplierProduct>(`${this.baseUrl}/supplierproducts`, link);
  }

  updateSupplierProduct(id: number, link: SupplierProductWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/supplierproducts/${id}`, link);
  }

  deleteSupplierProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/supplierproducts/${id}`);
  }

  getSupplierProductPriceHistory(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/supplierproducts/${id}/price-history`);
  }

  getProduct(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.baseUrl}/products/${id}`);
  }

  createProduct(product: ProductCreate): Observable<Product> {
    return this.http.post<Product>(`${this.baseUrl}/products`, product);
  }

  updateProduct(id: number, product: Partial<ProductCreate>): Observable<Product> {
    return this.http.put<Product>(`${this.baseUrl}/products/${id}`, product);
  }

  recordSupplierPayment(payment: {
    paidNo: string;
    paidDate: string;
    paymentMethod: string;
    supplierId: number;
    details: Array<{ purchaseInvoiceId: number; paidAmount: number }>;
  }): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/supplierpayments`, payment);
  }

  // ── Supplier Payments (voucher history) ──────────────────────────────────
  getSupplierPayments(supplierId?: number): Observable<SupplierPayment[]> {
    let params = new HttpParams();
    if (supplierId) params = params.set('supplierId', supplierId);
    return this.http.get<SupplierPayment[]>(`${this.baseUrl}/supplierpayments`, { params });
  }
  getSupplierPayment(id: number): Observable<SupplierPayment> {
    return this.http.get<SupplierPayment>(`${this.baseUrl}/supplierpayments/${id}`);
  }
  updateSupplierPayment(id: number, payment: SupplierPaymentUpdate): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/supplierpayments/${id}`, payment);
  }
  // Hard-deletes the voucher and restores Due on every invoice it touched.
  // Fails with a conflict if it's already been posted to the ledger — cancel
  // it (updateSupplierPayment with isCancelled: true) instead in that case.
  deleteSupplierPayment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/supplierpayments/${id}`);
  }
  uploadSupplierPaymentReceipt(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/supplierpayments/${id}/receipt-image`, file);
  }
  addSupplierPaymentDetail(id: number, detail: SupplierPaymentDetailWrite): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/supplierpayments/${id}/details`, detail);
  }
  updateSupplierPaymentDetail(id: number, detailId: number, detail: SupplierPaymentDetailWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/supplierpayments/${id}/details/${detailId}`, detail);
  }
  removeSupplierPaymentDetail(id: number, detailId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/supplierpayments/${id}/details/${detailId}`);
  }

  getProductPriceHistory(id: number): Observable<ProductPriceHistory[]> {
    return this.http.get<ProductPriceHistory[]>(`${this.baseUrl}/products/${id}/price-history`);
  }

  // Product Details (Schedule, DAR No, storage, composition, side effects,
  // pregnancy category, RequiresPrescription, IsControlledDrug). This is a
  // 1:1 upsert — the same call creates the row the first time and edits it
  // after that. RequiresPrescription set here is what the Sale form's
  // prescription-required gate actually reads.
  upsertProductDetails(id: number, details: ProductDetailsWrite): Observable<ProductDetailInfo> {
    return this.http.put<ProductDetailInfo>(`${this.baseUrl}/products/${id}/details`, details);
  }
  deleteProductDetails(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}/details`);
  }

  // Per-unit price rows (box/strip/pcs, each can carry its own purchase/sale/
  // distributor price) — separate from the single flat price on Product itself.
  addProductPrice(id: number, price: ProductPackagingWrite): Observable<ProductPackaging> {
    return this.http.post<ProductPackaging>(`${this.baseUrl}/products/${id}/prices`, price);
  }
  updateProductPrice(id: number, priceId: number, price: ProductPackagingWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/products/${id}/prices/${priceId}`, price);
  }
  deleteProductPrice(id: number, priceId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}/prices/${priceId}`);
  }
  deleteProductImage(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}/image`);
  }

  uploadProductImage(id: number, file: File): Observable<{ id: number; imagePath: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ id: number; imagePath: string }>(`${this.baseUrl}/products/${id}/image`, body);
  }

  private uploadFile(path: string, file: File): Observable<unknown> { const body = new FormData(); body.append('file', file); return this.http.post(path, body); }
  uploadPurchaseReceipt(id: number, file: File): Observable<unknown> { return this.uploadFile(`${this.baseUrl}/purchaseinvoices/${id}/receipt-image`, file); }
  uploadSupplierLogo(id: number, file: File): Observable<unknown> { return this.uploadFile(`${this.baseUrl}/suppliers/${id}/logo`, file); }
  deleteSupplierLogo(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/suppliers/${id}/logo`); }
  uploadCustomerPhoto(id: number, file: File): Observable<unknown> { return this.uploadFile(`${this.baseUrl}/customers/${id}/photo`, file); }
  deleteCustomerPhoto(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/customers/${id}/photo`); }
  uploadEmployeePhoto(id: number, file: File): Observable<unknown> { return this.uploadFile(`${this.baseUrl}/employees/${id}/photo`, file); }
  deleteEmployeePhoto(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/employees/${id}/photo`); }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}`);
  }

  // ── Inventory / Stocks ────────────────────────────────────────────────────

  getWarehouses(): Observable<Warehouse[]> {
    return this.http.get<any[]>(`${this.baseUrl}/warehouses`).pipe(map(items => items.map(w => ({ warehouseId: w.id, warehouseName: w.name, location: w.address, isActive: w.isActive }) as Warehouse)));
  }

  // ── Warehouses (full CRUD) ───────────────────────────────────────────────
  getWarehousesFull(): Observable<WarehouseFull[]> {
    return this.http.get<WarehouseFull[]>(`${this.baseUrl}/warehouses`);
  }
  getWarehouseById(id: number): Observable<WarehouseFull> {
    return this.http.get<WarehouseFull>(`${this.baseUrl}/warehouses/${id}`);
  }
  getWarehouseTypes(): Observable<WarehouseType[]> {
    return this.http.get<WarehouseType[]>(`${this.baseUrl}/warehousetypes`);
  }
  createWarehouse(w: WarehouseWrite): Observable<WarehouseFull> {
    return this.http.post<WarehouseFull>(`${this.baseUrl}/warehouses`, w);
  }
  updateWarehouse(id: number, w: WarehouseWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/warehouses/${id}`, w);
  }
  deleteWarehouse(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/warehouses/${id}`);
  }
  warehousePhotoUrl(id: number): string {
    return `${this.baseUrl}/warehouses/${id}/photo`;
  }

  getWarehousePhoto(id: number): Observable<Blob> {
    return this.http.get(this.warehousePhotoUrl(id), { responseType: 'blob' });
  }

  getProductStocks(warehouseId?: number): Observable<ProductStock[]> {
    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouseId', warehouseId.toString());
    return this.http.get<any[]>(`${this.baseUrl}/productstocks`, { params }).pipe(map(items => items
      .map(s => ({
        stockId: s.id, productId: s.productId, productName: s.productName,
        productCode: s.productCode, productImagePath: s.productImagePath, warehouseId: s.warehouseId, warehouseName: s.warehouseName,
        batchNumber: s.batchNumber, expiryDate: s.expiryDate, receivedDate: s.receivedDate,
        // "quantity" is the CURRENT remaining stock (drops on sale, rises on
        // return) — that's what the Inventory page and Dashboard's stock
        // valuation should both be reading. The original received size is
        // kept separately as receivedQuantity for reference/editing.
        quantity: s.availableQuantity ?? s.quantity, availableQuantity: s.availableQuantity, receivedQuantity: s.quantity,
        unitCost: s.unitCost ?? 0, unitId: s.unitId, unitName: s.unitName
      }) as ProductStock)));
  }

  getProductStock(id: number): Observable<ProductStockListItem> {
    return this.http.get<ProductStockListItem>(`${this.baseUrl}/productstocks/${id}`);
  }

  createProductStock(stock: ProductStockWrite): Observable<ProductStockListItem> {
    return this.http.post<ProductStockListItem>(`${this.baseUrl}/productstocks`, stock);
  }

  updateProductStock(id: number, stock: ProductStockWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/productstocks/${id}`, stock);
  }

  getExpiredProductStocks(): Observable<ExpiredProductStock[]> {
    return this.http.get<any[]>(`${this.baseUrl}/productstocks/expired`).pipe(map(items => items.map(s => ({
      stockId: s.id, productId: s.productId, productName: s.productName, batchNumber: s.batchNumber,
      expiryDate: s.expiryDate, quantity: s.availableQuantity, warehouseName: s.warehouseName
    }) as ExpiredProductStock)));
  }

  // Batches expiring within `days` (default 30) that haven't expired yet —
  // powers the Near-Expiry report so staff can discount/return stock before
  // it becomes a write-off. Same row shape as getExpiredProductStocks.
  getNearExpiryStocks(days = 30): Observable<ExpiredProductStock[]> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<any[]>(`${this.baseUrl}/productstocks/near-expiry`, { params }).pipe(map(items => items.map(s => ({
      stockId: s.id, productId: s.productId, productName: s.productName, batchNumber: s.batchNumber,
      expiryDate: s.expiryDate, daysLeft: s.daysLeft, quantity: s.availableQuantity, warehouseName: s.warehouseName
    }) as ExpiredProductStock)));
  }

  getLowStockProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.baseUrl}/products/lowstock`);
  }

  // ── Product Racks ────────────────────────────────────────────────────────
  getProductRaks(warehouseId?: number): Observable<ProductRakItem[]> {
    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouseId', warehouseId.toString());
    return this.http.get<ProductRakItem[]>(`${this.baseUrl}/productraks`, { params });
  }
  createProductRak(rak: ProductRakWrite): Observable<ProductRakItem> {
    return this.http.post<ProductRakItem>(`${this.baseUrl}/productraks`, rak);
  }
  deleteProductRak(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/productraks/${id}`);
  }

  // ── Stock Transfers ──────────────────────────────────────────────────────
  getStockTransfers(): Observable<StockTransfer[]> {
    return this.http.get<StockTransfer[]>(`${this.baseUrl}/stocktransfers`);
  }
  getStockTransfer(id: number): Observable<StockTransfer> {
    return this.http.get<StockTransfer>(`${this.baseUrl}/stocktransfers/${id}`);
  }
  createStockTransfer(transfer: StockTransferCreate): Observable<StockTransfer> {
    return this.http.post<StockTransfer>(`${this.baseUrl}/stocktransfers`, transfer);
  }
  markTransferReceived(id: number, invoiceId: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/stocktransfers/${id}`, { invoiceId, isReceived: true });
  }
  uploadTransferReceipt(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/stocktransfers/${id}/receipt-image`, file);
  }
  // Only meaningful before the transfer is received — once stock has moved
  // warehouses, deleting the record here does not reverse that in the UI.
  deleteStockTransfer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/stocktransfers/${id}`);
  }
  addStockTransferItem(id: number, item: { medicineId: number; quantity: number; expireDate?: string }): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/stocktransfers/${id}/items`, item);
  }
  updateStockTransferItem(id: number, itemId: number, item: { medicineId: number; quantity: number; expireDate?: string }): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/stocktransfers/${id}/items/${itemId}`, item);
  }
  removeStockTransferItem(id: number, itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/stocktransfers/${id}/items/${itemId}`);
  }

  // ── Sales ─────────────────────────────────────────────────────────────────

  getSales(): Observable<Sale[]> {
    return this.http.get<Sale[]>(`${this.baseUrl}/sales`);
  }

  getSale(id: number): Observable<Sale> {
    return this.http.get<Sale>(`${this.baseUrl}/sales/${id}`);
  }

  createSale(sale: SaleCreate): Observable<Sale> {
    return this.http.post<Sale>(`${this.baseUrl}/sales`, sale);
  }

  recordSalePayment(id: number, paymentMethod: string, amount?: number): Observable<Sale> {
    return this.http.post<Sale>(`${this.baseUrl}/sales/${id}/payment`, { paymentMethod, amount });
  }

  voidSale(id: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/sales/${id}/void`, { reason });
  }

  // ── Purchases ─────────────────────────────────────────────────────────────

  getPurchaseInvoices(supplierId?: number): Observable<PurchaseInvoice[]> {
    let params = new HttpParams();
    if (supplierId) params = params.set('supplierId', supplierId);
    return this.http.get<PurchaseInvoice[]>(`${this.baseUrl}/purchaseinvoices`, { params });
  }

  getPurchaseInvoice(id: number): Observable<PurchaseInvoice> {
    return this.http.get<PurchaseInvoice>(`${this.baseUrl}/purchaseinvoices/${id}`);
  }

  createPurchaseInvoice(invoice: unknown): Observable<PurchaseInvoice> {
    return this.http.post<PurchaseInvoice>(`${this.baseUrl}/purchaseinvoices`, invoice);
  }

  updatePurchaseInvoice(id: number, invoice: unknown): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/purchaseinvoices/${id}`, invoice);
  }

  updatePurchaseInvoiceFull(id: number, invoice: unknown): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/purchaseinvoices/${id}/full-edit`, invoice);
  }

  deletePurchaseInvoice(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/purchaseinvoices/${id}`);
  }

  getDailyPurchaseRequirements(): Observable<DailyPurchaseRequirement[]> {
    return this.http.get<DailyPurchaseRequirement[]>(`${this.baseUrl}/dailypurchaserequirements`);
  }

  generateDailyPurchaseRequirements(): Observable<DailyPurchaseRequirement[]> {
    return this.http.post<DailyPurchaseRequirement[]>(`${this.baseUrl}/dailypurchaserequirements/generate`, {});
  }

  convertRequirementsToOrder(payload: { serialNos: string[]; supplierId: number; supplierTypeId?: number }): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${this.baseUrl}/dailypurchaserequirements/convert-to-order`, payload);
  }

  createDailyPurchaseRequirement(req: Partial<DailyPurchaseRequirement>): Observable<DailyPurchaseRequirement> {
    return this.http.post<DailyPurchaseRequirement>(`${this.baseUrl}/dailypurchaserequirements`, req);
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  getPurchaseOrders(): Observable<PurchaseOrder[]> {
    return this.http.get<PurchaseOrder[]>(`${this.baseUrl}/purchaseorders`);
  }

  getPurchaseOrder(id: number): Observable<PurchaseOrder> {
    return this.http.get<PurchaseOrder>(`${this.baseUrl}/purchaseorders/${id}`);
  }

  createPurchaseOrder(order: PurchaseOrderCreate): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${this.baseUrl}/purchaseorders`, order);
  }

  updatePurchaseOrder(id: number, order: PurchaseOrderUpdate): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/purchaseorders/${id}`, order);
  }

  deletePurchaseOrder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/purchaseorders/${id}`);
  }

  addPurchaseOrderItem(orderId: number, item: PurchaseOrderItemWrite): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/purchaseorders/${orderId}/items`, item);
  }

  // Edits an existing line (price, qty, product/unit, cancelled) on a saved
  // purchase order — e.g. correcting Last Purchase Price from the Edit screen.
  updatePurchaseOrderItem(orderId: number, itemId: number, item: PurchaseOrderItemWrite): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/purchaseorders/${orderId}/items/${itemId}`, item);
  }

  removePurchaseOrderItem(orderId: number, itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/purchaseorders/${orderId}/items/${itemId}`);
  }

  uploadPurchaseOrderReceipt(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/purchaseorders/${id}/receipt-image`, file);
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  getSuppliers(companyId?: number): Observable<Supplier[]> {
    let params = new HttpParams();
    if (companyId) params = params.set('companyId', companyId);
    return this.http.get<Supplier[]>(`${this.baseUrl}/suppliers`, { params });
  }

  getSupplier(id: number): Observable<Supplier> {
    return this.http.get<Supplier>(`${this.baseUrl}/suppliers/${id}`);
  }

  getSupplierTypes(): Observable<SupplierType[]> {
    return this.http.get<SupplierType[]>(`${this.baseUrl}/suppliertypes`);
  }

  createSupplier(supplier: Partial<Supplier>): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.baseUrl}/suppliers`, supplier);
  }

  updateSupplier(id: number, supplier: Partial<Supplier>): Observable<Supplier> {
    return this.http.put<Supplier>(`${this.baseUrl}/suppliers/${id}`, supplier);
  }

  deleteSupplier(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/suppliers/${id}`);
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${this.baseUrl}/customers`);
  }

  getCustomer(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.baseUrl}/customers/${id}`);
  }

  getCustomerTypes(): Observable<{ id: number; name: string }[]> {
    return this.http.get<any[]>(`${this.baseUrl}/customertypes`).pipe(map(items => items.map(item => ({
      id: item.id ?? item.customerTypeId,
      name: item.name ?? item.customerTypeName
    }))));
  }

  createCustomer(customer: Partial<Customer>): Observable<Customer> {
    return this.http.post<Customer>(`${this.baseUrl}/customers`, customer);
  }

  updateCustomer(id: number, customer: Partial<Customer>): Observable<Customer> {
    return this.http.put<Customer>(`${this.baseUrl}/customers/${id}`, customer);
  }

  deleteCustomer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/customers/${id}`);
  }

  // ── HR / Employees ────────────────────────────────────────────────────────

  getDepartments(): Observable<Department[]> {
    return this.http.get<Department[]>(`${this.baseUrl}/departments`);
  }

  getEmployees(departmentId?: number): Observable<Employee[]> {
    let params = new HttpParams();
    if (departmentId) params = params.set('departmentId', departmentId.toString());
    return this.http.get<Employee[]>(`${this.baseUrl}/employees`, { params });
  }

  getEmployee(id: number): Observable<Employee> {
    return this.http.get<Employee>(`${this.baseUrl}/employees/${id}`);
  }

  createEmployee(employee: Partial<Employee>): Observable<Employee> {
    return this.http.post<Employee>(`${this.baseUrl}/employees`, employee);
  }

  updateEmployee(id: number, employee: Partial<Employee>): Observable<Employee> {
    return this.http.put<Employee>(`${this.baseUrl}/employees/${id}`, employee);
  }

  deleteEmployee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/employees/${id}`);
  }

  getEmployeeDocuments(employeeId: number): Observable<EmployeeDocument[]> {
    return this.http.get<EmployeeDocument[]>(`${this.baseUrl}/employees/${employeeId}/documents`);
  }

  addEmployeeDocument(employeeId: number, doc: EmployeeDocumentWrite): Observable<EmployeeDocument> {
    return this.http.post<EmployeeDocument>(`${this.baseUrl}/employees/${employeeId}/documents`, doc);
  }

  getCustomerAddresses(customerId: number): Observable<CustomerAddress[]> {
    return this.http.get<CustomerAddress[]>(`${this.baseUrl}/customers/${customerId}/addresses`);
  }

  addCustomerAddress(customerId: number, address: CustomerAddressWrite): Observable<CustomerAddress> {
    return this.http.post<CustomerAddress>(`${this.baseUrl}/customers/${customerId}/addresses`, address);
  }

  // ── Accounting ────────────────────────────────────────────────────────────

  getChartOfAccounts(): Observable<ChartOfAccount[]> {
    return this.http.get<ChartOfAccount[]>(`${this.baseUrl}/chartofaccounts`);
  }
  createChartOfAccount(account: unknown): Observable<unknown> { return this.http.post(`${this.baseUrl}/chartofaccounts`, account); }
  updateChartOfAccount(id: number, account: unknown): Observable<unknown> { return this.http.put(`${this.baseUrl}/chartofaccounts/${id}`, account); }
  deleteChartOfAccount(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/chartofaccounts/${id}`); }

  getCompanyAssets(): Observable<CompanyAsset[]> {
    return this.http.get<CompanyAsset[]>(`${this.baseUrl}/companyassets`);
  }
  createCompanyAsset(asset: CompanyAssetCreate): Observable<unknown> { return this.http.post(`${this.baseUrl}/companyassets`, asset); }
  getCompanyAsset(id: number): Observable<CompanyAssetDetail> { return this.http.get<CompanyAssetDetail>(`${this.baseUrl}/companyassets/${id}`); }
  updateCompanyAsset(id: number, asset: CompanyAssetCreate): Observable<unknown> { return this.http.put(`${this.baseUrl}/companyassets/${id}`, asset); }
  deleteCompanyAsset(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/companyassets/${id}`); }
  depreciateCompanyAsset(id: number): Observable<unknown> { return this.http.post(`${this.baseUrl}/companyassets/${id}/depreciate`, {}); }
  disposeCompanyAsset(id: number, disposalDate?: string): Observable<void> { return this.http.post<void>(`${this.baseUrl}/companyassets/${id}/dispose`, disposalDate ?? null); }

  getCompanyLiabilities(): Observable<CompanyLiability[]> {
    return this.http.get<CompanyLiability[]>(`${this.baseUrl}/companyliabilities`);
  }
  createCompanyLiability(liability: CompanyLiabilityCreate): Observable<unknown> { return this.http.post(`${this.baseUrl}/companyliabilities`, liability); }
  getCompanyLiability(id: number): Observable<CompanyLiabilityDetail> { return this.http.get<CompanyLiabilityDetail>(`${this.baseUrl}/companyliabilities/${id}`); }
  updateCompanyLiability(id: number, liability: CompanyLiabilityCreate): Observable<unknown> { return this.http.put(`${this.baseUrl}/companyliabilities/${id}`, liability); }
  deleteCompanyLiability(id: number): Observable<void> { return this.http.delete<void>(`${this.baseUrl}/companyliabilities/${id}`); }
  payCompanyLiability(id: number, amount: number): Observable<unknown> { return this.http.post(`${this.baseUrl}/companyliabilities/${id}/pay`, { amount }); }

  getLedgerAccounts(): Observable<LedgerAccount[]> {
    return this.http.get<LedgerAccount[]>(`${this.baseUrl}/ledgeraccounts`);
  }
  createJournalEntry(entry: JournalEntryCreate): Observable<unknown> { return this.http.post(`${this.baseUrl}/ledgeraccounts/journal-entries`, entry); }
  reverseVoucher(voucherNo: string): Observable<unknown> { return this.http.post(`${this.baseUrl}/ledgeraccounts/voucher/${encodeURIComponent(voucherNo)}/reverse`, {}); }

  // ── Sellable Stocks ────────────────────────────────────────────────────────

  // Lists sellable batches (availableQuantity > 0 && not expired), filterable
  // by warehouse, company, dosage form, generic name, and free-text search.
  // Maps to ProductStockListItem[] DTO in backend.
  getSellableStocks(filters?: {
    search?: string;
    warehouseId?: number;
    companyId?: number;
    dosageFormId?: number;
    genericName?: string;
    strength?: string;
    productId?: number;
  }): Observable<ProductStockListItem[]> {
    let params = new HttpParams();
    if (filters?.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters?.warehouseId) params = params.set('warehouseId', filters.warehouseId);
    if (filters?.companyId) params = params.set('companyId', filters.companyId);
    if (filters?.dosageFormId) params = params.set('dosageFormId', filters.dosageFormId);
    if (filters?.genericName?.trim()) params = params.set('genericName', filters.genericName.trim());
    if (filters?.strength?.trim()) params = params.set('strength', filters.strength.trim());
    if (filters?.productId) params = params.set('productId', filters.productId);
    return this.http.get<ProductStockListItem[]>(`${this.baseUrl}/productstocks`, { params });
  }

  // Barcode → single Product, used by the Sale/Purchase form's scanner input.
  getProductByBarcode(barcode: string): Observable<Product> {
    const params = new HttpParams().set('barcode', barcode);
    return this.http.get<Product>(`${this.baseUrl}/products/by-barcode`, { params });
  }

  // Distinct dosage forms / generic names that occur in a company's own
  // catalogue — powers the Company → Products drill-down's filter dropdowns.
  getProductFilterOptions(companyId: number): Observable<ProductFilterOptions> {
    const params = new HttpParams().set('companyId', companyId.toString());
    return this.http.get<ProductFilterOptions>(`${this.baseUrl}/products/filter-options`, { params });
  }

  // ── Returns ─────────────────────────────────────────────────────────────

  // Purchase returns from suppliers (api/purchasereturns)
  getPurchaseReturns(purchaseInvoiceId?: number): Observable<PurchaseReturn[]> {
    let params = new HttpParams();
    if (purchaseInvoiceId) params = params.set('purchaseInvoiceId', purchaseInvoiceId.toString());
    return this.http.get<PurchaseReturn[]>(`${this.baseUrl}/purchasereturns`, { params });
  }

  getPurchaseReturn(id: number): Observable<PurchaseReturn> {
    return this.http.get<PurchaseReturn>(`${this.baseUrl}/purchasereturns/${id}`);
  }

  createPurchaseReturn(ret: PurchaseReturnCreate): Observable<PurchaseReturn> {
    return this.http.post<PurchaseReturn>(`${this.baseUrl}/purchasereturns`, ret);
  }

  updatePurchaseReturn(id: number, ret: Partial<PurchaseReturnUpdate>): Observable<PurchaseReturn> {
    return this.http.put<PurchaseReturn>(`${this.baseUrl}/purchasereturns/${id}`, ret);
  }

  deletePurchaseReturn(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/purchasereturns/${id}`);
  }

  // NOTE: purchasereturns/{id}/items (add/update) are intentionally NOT
  // wired up here — the backend DTO for those two actions has ProductId/
  // UnitId/UnitCost marked [JsonIgnore], so they always 400 no matter what
  // is sent, and even fixing that wouldn't reverse/redo the stock quantity
  // that Create() adjusts. Correcting a wrong return means deleting it and
  // creating a new one, not editing a line in place — same as Sale Returns.
  addPurchaseReturnReceive(id: number, receive: { receivedAmount: number; receivedDate: string; paymentMethod: string; note?: string }): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/purchasereturns/${id}/receives`, receive);
  }
  uploadPurchaseReturnReceipt(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/purchasereturns/${id}/receipt-image`, file);
  }

  // Sale returns from customers (api/salereturns)
  getSaleReturns(saleId?: number): Observable<SaleReturn[]> {
    let params = new HttpParams();
    if (saleId) params = params.set('saleId', saleId.toString());
    return this.http.get<SaleReturn[]>(`${this.baseUrl}/salereturns`, { params });
  }

  getSaleReturn(id: number): Observable<SaleReturn> {
    return this.http.get<SaleReturn>(`${this.baseUrl}/salereturns/${id}`);
  }

  createSaleReturn(ret: SaleReturnCreate): Observable<SaleReturn> {
    return this.http.post<SaleReturn>(`${this.baseUrl}/salereturns`, ret);
  }

  updateSaleReturn(id: number, ret: Partial<SaleReturnUpdate>): Observable<SaleReturn> {
    return this.http.put<SaleReturn>(`${this.baseUrl}/salereturns/${id}`, ret);
  }

  deleteSaleReturn(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/salereturns/${id}`);
  }

  // NOTE: salereturns/{id}/items (add/update) skipped for the same reason
  // as purchasereturns above — [JsonIgnore] on MedicineId/UnitId/SalesPrice
  // makes them always fail, and item edits wouldn't reconcile stock/ledger
  // anyway. Refund is the real, safe, ledger-correct way to adjust a return.
  refundSaleReturn(id: number, refund: { amount: number; paymentMethod: string; note?: string }): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/salereturns/${id}/refunds`, refund);
  }
  uploadSaleReturnReceipt(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/salereturns/${id}/receipt-image`, file);
  }

  // ── Expiredstocks (Disposals) ────────────────────────────────────────────────

  getDisposalRecords(warehouseId?: number, productId?: number, status?: string): Observable<ExpiredProductStockRead[]> {
    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouseId', warehouseId.toString());
    if (productId) params = params.set('productId', productId.toString());
    if (status) params = params.set('status', status);
    return this.http.get<ExpiredProductStockRead[]>(`${this.baseUrl}/expiredproductstocks`, { params });
  }

  getDisposalApprovalThreshold(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/expiredproductstocks/approval-threshold`);
  }
  approveDisposal(id: number): Observable<ExpiredProductStockRead> {
    return this.http.post<ExpiredProductStockRead>(`${this.baseUrl}/expiredproductstocks/${id}/approve`, {});
  }
  rejectDisposal(id: number, reason?: string): Observable<ExpiredProductStockRead> {
    return this.http.post<ExpiredProductStockRead>(`${this.baseUrl}/expiredproductstocks/${id}/reject`, { reason });
  }

  getDisposalRecord(id: number): Observable<ExpiredProductStockRead> {
    return this.http.get<ExpiredProductStockRead>(`${this.baseUrl}/expiredproductstocks/${id}`);
  }

  createDisposal(dispose: ExpiredProductStockCreate): Observable<ExpiredProductStockRead> {
    return this.http.post<ExpiredProductStockRead>(`${this.baseUrl}/expiredproductstocks`, dispose);
  }

  updateDisposal(id: number, dispose: ExpiredProductStockCreate): Observable<void> { return this.http.put<void>(`${this.baseUrl}/expiredproductstocks/${id}`, dispose); }

  deleteDisposal(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/expiredproductstocks/${id}`);
  }

  // ── Doctors ───────────────────────────────────────────────────────────────

  getDoctors(search?: string): Observable<Doctor[]> {
    let params = new HttpParams();
    if (search?.trim()) params = params.set('search', search.trim());
    return this.http.get<Doctor[]>(`${this.baseUrl}/doctors`, { params });
  }

  getDoctor(id: number): Observable<Doctor> {
    return this.http.get<Doctor>(`${this.baseUrl}/doctors/${id}`);
  }

  getDoctorPrescriptions(id: number): Observable<Prescription[]> {
    return this.http.get<Prescription[]>(`${this.baseUrl}/doctors/${id}/prescriptions`);
  }

  createDoctor(doctor: DoctorWrite): Observable<Doctor> {
    return this.http.post<Doctor>(`${this.baseUrl}/doctors`, doctor);
  }

  updateDoctor(id: number, doctor: DoctorWrite): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/doctors/${id}`, doctor);
  }

  deleteDoctor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/doctors/${id}`);
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  getPrescriptions(filters?: { customerId?: number; doctorId?: number }): Observable<Prescription[]> {
    let params = new HttpParams();
    if (filters?.customerId) params = params.set('customerId', filters.customerId);
    if (filters?.doctorId) params = params.set('doctorId', filters.doctorId);
    return this.http.get<Prescription[]>(`${this.baseUrl}/prescriptions`, { params });
  }

  getPrescription(id: number): Observable<Prescription> {
    return this.http.get<Prescription>(`${this.baseUrl}/prescriptions/${id}`);
  }

  createPrescription(p: PrescriptionCreate): Observable<Prescription> {
    return this.http.post<Prescription>(`${this.baseUrl}/prescriptions`, p);
  }

  updatePrescription(id: number, p: PrescriptionUpdate): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/prescriptions/${id}`, p);
  }

  deletePrescription(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/prescriptions/${id}`);
  }

  uploadPrescriptionImage(id: number, file: File): Observable<unknown> {
    return this.uploadFile(`${this.baseUrl}/prescriptions/${id}/image`, file);
  }

  // ── SMS logs (audit trail) ────────────────────────────────────────────────

  getSmsLogs(filters?: {
    phoneNumber?: string;
    isSuccess?: boolean;
    fromDate?: string;
    toDate?: string;
    take?: number;
  }): Observable<SmsLog[]> {
    let params = new HttpParams();
    if (filters?.phoneNumber?.trim()) params = params.set('phoneNumber', filters.phoneNumber.trim());
    // Explicit null check: `false` is a meaningful value here.
    if (filters?.isSuccess !== undefined && filters.isSuccess !== null) {
      params = params.set('isSuccess', filters.isSuccess);
    }
    if (filters?.fromDate) params = params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params = params.set('toDate', filters.toDate);
    if (filters?.take) params = params.set('take', filters.take);
    return this.http.get<SmsLog[]>(`${this.baseUrl}/smslogs`, { params });
  }

  getPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(`${this.baseUrl}/paymentmethods`);
  }

  getActivityLogs(take = 100): Observable<ActivityLog[]> {
    return this.http.get<ActivityLog[]>(`${this.baseUrl}/activitylogs`, {
      params: new HttpParams().set('take', take),
    });
  }

  recordCurrentActivitySession(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/activitylogs/current-session`, {});
  }

  getSmsLog(id: number): Observable<SmsLog> {
    return this.http.get<SmsLog>(`${this.baseUrl}/smslogs/${id}`);
  }

  createSmsLog(log: SmsLogCreate): Observable<SmsLog> {
    return this.http.post<SmsLog>(`${this.baseUrl}/smslogs`, log);
  }

  deleteSmsLog(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/smslogs/${id}`);
  }

  // NOTE: the backend declares this as [HttpDelete("purge")], not PUT.
  purgeSmsLogs(olderThanDays = 90): Observable<SmsLogPurgeResult> {
    const params = new HttpParams().set('olderThanDays', olderThanDays);
    return this.http.delete<SmsLogPurgeResult>(`${this.baseUrl}/smslogs/purge`, { params });
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  private reportUrl(path: string, params: Record<string, any> = {}): { url: string; params: HttpParams } {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') httpParams = httpParams.set(k, v);
    });
    return { url: `${this.baseUrl}/reports/${path}`, params: httpParams };
  }

  getSalesReport(p: { from?: string; to?: string; expiredOnly?: boolean }) {
    const { url, params } = this.reportUrl('sales', p);
    return this.http.get<any[]>(url, { params });
  }
  getProductSalesReport(p: { from?: string; to?: string; companyId?: number }) {
    const { url, params } = this.reportUrl('product-sales', p);
    return this.http.get<any[]>(url, { params });
  }
  getProfitReport(p: { from?: string; to?: string; productId?: number }) {
    const { url, params } = this.reportUrl('profit', p);
    return this.http.get<any[]>(url, { params });
  }
  getStockValuationReport(p: { warehouseId?: number }) {
    const { url, params } = this.reportUrl('stock-valuation', p);
    return this.http.get<any[]>(url, { params });
  }
  getExpiryReport(p: { warehouseId?: number }) {
    const { url, params } = this.reportUrl('expiry', p);
    return this.http.get<any[]>(url, { params });
  }
  getReorderReport(p: { companyId?: number }) {
    const { url, params } = this.reportUrl('reorder', p);
    return this.http.get<any[]>(url, { params });
  }
  getCustomerDuesReport(p: { customerId?: number }) {
    const { url, params } = this.reportUrl('customer-dues', p);
    return this.http.get<any[]>(url, { params });
  }
  getSupplierDuesReport(p: { supplierId?: number }) {
    const { url, params } = this.reportUrl('supplier-dues', p);
    return this.http.get<any[]>(url, { params });
  }
  getPrescriptionRegister(p: { from?: string; to?: string; doctorId?: number }) {
    const { url, params } = this.reportUrl('prescription-register', p);
    return this.http.get<any[]>(url, { params });
  }
  getPurchaseReport(p: { from?: string; to?: string; supplierId?: number }) {
    const { url, params } = this.reportUrl('purchases', p);
    return this.http.get<any[]>(url, { params });
  }
  getReturnsReport(p: { from?: string; to?: string }) {
    const { url, params } = this.reportUrl('returns', p);
    return this.http.get<any[]>(url, { params });
  }
  getExpiryLossReport(p: { from?: string; to?: string }) {
    const { url, params } = this.reportUrl('expiry-loss', p);
    return this.http.get<any[]>(url, { params });
  }
}
