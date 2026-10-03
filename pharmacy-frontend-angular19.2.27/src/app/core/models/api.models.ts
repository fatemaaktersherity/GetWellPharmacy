// ── Products ────────────────────────────────────────────────────────────────

export interface Unit {
  unitId: number;
  unitName: string;
  unitSymbol?: string;
}

export interface UnitWrite {
  name: string;
}

// "Allopathic" or "Herbal" — matches medex.com.bd's Browse menu split.
export type BrandType = "Allopathic" | "Herbal";

export interface Product {
  id: number;
  productCode?: string;
  productName: string;
  strength: string;
  genericName?: string;
  brandType?: BrandType;
  barcode?: string;
  companyId?: number;
  companyName?: string;
  dosageFormId?: number;
  dosageFormName?: string;
  productVariantId?: number;
  productGroupId?: number;
  productGroupName?: string;
  productCategoryId?: number | null;
  productCategoryName?: string | null;
  productCategoryParentName?: string | null;
  unitId: number;
  unitName: string;
  unitPrice: number;
  purchasePrice: number;
  distributorPrice?: number;
  salePrice?: number;
  stockQuantity: number;
  minStockQty: number;
  maxStockQty: number;
  isActive?: boolean;
  imagePath?: string;
  productImageContentType?: string;
  prices?: ProductPackaging[];
  // Only populated by GET /products/{id} (not the list/search endpoints).
  details?: ProductDetailInfo;
}

// Flattened 1:1 "Details" row — pharmacology/regulatory info shown on the
// product detail page (medex.com.bd-style "Indications" section).
export interface ProductDetailInfo {
  description?: string;
  schedule?: string;
  darNo?: string;
  storageConditions?: string;
  temperatureMin?: number;
  temperatureMax?: number;
  composition?: string;
  sideEffects?: string;
  pregnancyCategory?: string;
  requiresPrescription: boolean;
  isControlledDrug: boolean;
}

// Body for PUT /products/{id}/details (upsert). Same shape as
// ProductDetailInfo minus the two fields the server derives on its own.
export interface ProductDetailsWrite {
  description?: string;
  schedule?: string;
  darNo?: string;
  storageConditions?: string;
  temperatureMin?: number;
  temperatureMax?: number;
  composition?: string;
  sideEffects?: string;
  pregnancyCategory?: string;
  requiresPrescription: boolean;
  isControlledDrug: boolean;
}

export interface ProductPackaging {
  id?: number;
  unitId: number;
  unitName?: string;
  /** Exact customer-facing pack name, e.g. "60 ml bottle (Raspberry)". */
  displayName?: string;
  perUnitPrice: number;
  baseQuantity: number;
  // Independent per-unit prices — a Box's purchase/sale price is its own
  // number, never derived from the product's flat master price.
  purchasePrice?: number;
  salePrice?: number;
  distributorPrice?: number;
}

// Body for POST/PUT /products/{id}/prices[/{priceId}] — same shape as
// ProductPackaging minus the server-assigned id/unitName.
export interface ProductPackagingWrite {
  unitId: number;
  displayName?: string;
  perUnitPrice: number;
  baseQuantity: number;
  purchasePrice?: number;
  salePrice?: number;
  distributorPrice?: number;
}

// Distinct dosage forms / generic names occurring within one company's own
// catalogue — powers the Company → Products drill-down's filter dropdowns.
export interface ProductFilterOptions {
  dosageForms: { id: number; name: string }[];
  genericNames: string[];
}

// Row on the "List of Brand Names" page (P3).
export interface ProductBrandListItem {
  id: number;
  productName: string;
  strength: string;
  genericName?: string;
  brandType?: BrandType;
  imagePath?: string;
  unitName: string;
  companyName?: string;
  dosageFormName?: string;
}

// ── Companies / Dosage Forms (Brand Search filters) ──────────────────────────

export interface Company {
  id: number;
  name: string;
  isActive: boolean;
  productCount: number;
  divisionCount?: number;
}

export interface CompanyDivision {
  id: number;
  companyId: number;
  name: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  parentCategoryId?: number | null;
  parentCategoryName?: string | null;
}

export interface DosageForm {
  id: number;
  name: string;
  productCount: number;
}

// ── Supplier <-> Product (many-to-many) ───────────────────────────────────────

export interface SupplierProductPrice {
  id?: number;
  unitId: number;
  unitName?: string;
  baseQuantity: number;
  purchasePrice: number;
  salePrice?: number;
  unitPrice?: number;
  distributorPrice?: number;
  updatedAt?: string;
}

export interface SupplierProduct {
  id: number;
  supplierId: number;
  supplierName: string;
  productId: number;
  productName: string;
  productStrength?: string;
  supplierProductCode?: string;
  isPreferred: boolean;
  isActive: boolean;
  lastPurchaseDate?: string;
  lastPurchaseUnitCost?: number;
  lastPurchaseUnitId?: number;
  lastPurchaseUnitName?: string;
  note?: string;
  prices: SupplierProductPrice[];
}

export interface SupplierProductWrite {
  supplierId: number;
  productId: number;
  supplierProductCode?: string;
  isPreferred?: boolean;
  isActive?: boolean;
  note?: string;
  prices?: SupplierProductPrice[];
}

// Effective price lookup for a Purchase Invoice line — auto-fills UnitCost /
// SalePrice the moment Product + Unit (+ Supplier) are chosen.
export interface EffectiveUnitPrice {
  productId: number;
  unitId: number;
  unitName: string;
  baseQuantity: number;
  purchasePrice: number;
  salePrice?: number;
  unitPrice?: number;
  distributorPrice?: number;
  source: "Supplier" | "Product";
}

export interface ProductPriceHistory {
  id: number;
  priceType: string;
  unitName?: string;
  previousPrice?: number;
  newPrice: number;
  previousBaseQuantity?: number;
  newBaseQuantity?: number;
  changedAt: string;
}

export interface ProductCreate {
  productCode?: string;
  productName: string;
  strength: string;
  genericName?: string;
  brandType?: BrandType;
  companyId?: number;
  dosageFormId?: number;
  productVariantId?: number;
  productCategoryId?: number | null;
  unitId: number;
  unitPrice: number;
  purchasePrice: number;
  distributorPrice?: number;
  salePrice?: number;
  minStockQty: number;
  maxStockQty: number;
  isActive?: boolean;
  prices?: ProductPackaging[];
  details?: { requiresPrescription?: boolean };
}

export interface ProductGroup {
  id: number;
  name: string;
  genericName?: string;
  companyId?: number;
  companyName?: string;
  companyDivisionId?: number | null;
  companyDivisionName?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  parentCategoryId?: number | null;
  parentCategoryName?: string | null;
  variantCount: number;
}

export interface ProductGroupDetail extends ProductGroup {
  variants: ProductVariant[];
}

export interface ProductGroupWrite {
  name: string;
  genericName?: string;
  companyId?: number | null;
  companyDivisionId?: number | null;
  categoryId?: number | null;
}

export interface ProductVariant {
  id: number;
  productGroupId: number;
  strength: string;
  dosageFormId: number;
  dosageFormName: string;
}

export interface ProductVariantWrite {
  strength: string;
  dosageFormId: number;
}

// ── Inventory / Stocks ───────────────────────────────────────────────────────

export interface Warehouse {
  warehouseId: number;
  warehouseName: string;
  location?: string;
  isActive: boolean;
}

export interface ProductStock {
  stockId: number;
  productId: number;
  productName: string;
  productCode?: string;
  productImagePath?: string;
  warehouseId: number;
  warehouseName: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  receivedDate?: string;
  // The batch's CURRENT remaining stock (what's actually left on the
  // shelf right now — goes down on sale, back up on sale return).
  quantity: number;
  availableQuantity?: number;
  // The batch's ORIGINAL received quantity when it was first stocked —
  // never changes from sales/returns, only from editing the batch itself.
  receivedQuantity?: number;
  unitCost: number;
  unitId: number;
  unitName: string;
}

export interface ProductStockWrite {
  productId: number;
  warehouseId: number;
  batchNumber: string;
  quantity: number;
  availableQuantity?: number;
  expiryDate: string;
  manufacturingDate?: string;
  receivedDate?: string;
  unitCost: number;
}

export interface ExpiredProductStock {
  stockId: number;
  productId: number;
  productName: string;
  batchNumber?: string;
  expiryDate: string;
  daysLeft?: number;
  quantity: number;
  warehouseName: string;
}

// ── Sales ────────────────────────────────────────────────────────────────────

export interface SaleItem {
  saleItemId?: number;
  productStockId: number;
  productId?: number;
  productName?: string;
  productImagePath?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  unitId: number;
  unitName?: string;
  quantity: number;
  baseQuantity?: number;
  unitPrice: number;
  totalPrice?: number;
}

export interface Sale {
  saleId: number;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  termsAndConditions?: string;
  saleDate: string;
  totalAmount: number;                /** Items subtotal, before discount. */
  discount?: number;               /** Flat discount taken off at the point of sale. */
  netAmount?: number;              /** totalAmount - discount: what the customer actually owes. */
  paymentMethod: string;
  isPaid?: boolean;
  isVoided?: boolean;
  totalPaid?: number;
  dueAmount?: number;
  // Total of all posted returns against this sale, and whether any exist —
  // powers the "Returned" / "Partially Returned" status on the Sales list.
  returnedAmount?: number;
  hasReturns?: boolean;
  // Whether this sale required a prescription, and which one (if any) was
  // linked to it — PrescriptionId is the FK set server-side in
  // SalesController.Create; PrescriptionImagePath is populated from the
  // linked Prescription's ImagePath so it can be shown without a second call.
  requiresPrescription?: boolean;
  prescriptionId?: number | null;
  prescriptionImagePath?: string;
  items: SaleItem[];
}

export interface SaleCreate {
  customerId?: number | null;
  paymentMethod: string;
  isPaid?: boolean;
  discount?: number;
  termsAndConditions?: string;
  requiresPrescription?: boolean;
  prescriptionId?: number | null;
  items: SaleItem[];
}

// ── Purchases ────────────────────────────────────────────────────────────────

export interface PurchaseInvoiceItem {
  id?: number;
  productId: number;
  productName?: string;
  unitId: number;
  unitName?: string;
  // Quantity actually received against this line, entered at invoice time.
  receivedQty: number;
  // Snapshot of the matching purchase-order line's orderQty, computed and
  // stored server-side when the item was recorded (see
  // PurchaseInvoicesController.ConsumeOrderedQty on the backend). Undefined
  // for direct purchases with no linked purchase order, or a line that
  // didn't match any order line.
  orderedQty?: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
}

export interface PurchaseInvoice {
  id: number;
  invoiceNo: string;
  purchaseDate: string;
  supplierId: number;
  supplierName?: string;
  companyId?: number; // ADD
  companyName?: string;
  warehouseId: number;
  warehouseName?: string;
  total: number;
  advance: number;
  due: number;
  paymentStatus: string;
  isPaymentComplete: boolean;
  receivingStatus: "Completed" | "Partially Received";
  receiptImagePath?: string;
  paymentMethod: string | null;
  paymentMethods?: string[];
  purchaseOrderId?: number;
  discount?: number;
  taxOrOthers?: number;
  items: PurchaseInvoiceItem[];
}

export interface DailyPurchaseRequirement {
  serialNo: string;       // Guid
  productId: number;
  productName: string;
  unitId: number;
  unitName: string;
  lastPurchaseRate: number;
  stockQty: number;
  requiredQty: number;
  ordersQty: number;
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export interface Supplier {
  supplierId: number;
  supplierName: string;
  companyId?: number;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  distributor?: boolean;
  openingBalance?: number;
  supplierTypeId?: number;
  supplierTypeName: string;
  logoPath?: string;
  isActive?: boolean;
  contacts?: SupplierContact[];
}

// One person to reach at a supplier — a supplier can have several (sales
// rep, accounts person, etc.), one of which can be flagged primary.
export interface SupplierContact {
  id?: number;
  contactName: string;
  designation?: string;
  phone?: string;
  isPrimary: boolean;
}

// Body for one contact row when syncing a supplier's whole contact list via
// SupplierCreateDto/SupplierUpdateDto.Contacts — omit `id` (or send 0) to
// insert a new one, or pass an existing id to update that row in place. Any
// existing contact whose id is missing from the array you send gets removed.
export interface SupplierContactWrite {
  id?: number | null;
  contactName: string;
  designation?: string;
  phone?: string;
  isPrimary: boolean;
}

// Lookup table behind Supplier.SupplierTypeId (Manufacturer/Distributor/
// Local Vendor, etc.) — served by SupplierTypesController.
export interface SupplierType {
  id: number;
  name: string;
  supplierCount: number;
}

// ── Supplier Payments ────────────────────────────────────────────────────────

// One allocation row on a payment voucher — how much of this voucher went
// toward a specific purchase invoice.
export interface SupplierPaymentDetail {
  id: number;
  purchaseInvoiceId: number;
  invoiceNo?: string;
  lineNo: number;
  totalAmount: number;
  dueBeforePayment: number;
  prePaid?: number;
  paidAmount: number;
}

export interface SupplierPaymentDetailWrite {
  purchaseInvoiceId: number;
  paidAmount: number;
  prePaid?: number;
}

export interface SupplierPayment {
  id: number;
  paidNo: string;
  paidDate: string;
  paymentMethod: string;
  supplierId: number;
  supplierName?: string;
  totalAmount: number;
  createdAt: string;
  isCancelled: boolean;
  receiptImagePath?: string;
  receiptImageContentType?: string;
  details: SupplierPaymentDetail[];
}

export interface SupplierPaymentCreate {
  paidNo: string;
  paidDate: string;
  paymentMethod: string;
  supplierId: number;
  details: SupplierPaymentDetailWrite[];
}

export interface SupplierPaymentUpdate {
  paidNo: string;
  paidDate: string;
  paymentMethod: string;
  isCancelled: boolean;
}

// ── Customers ────────────────────────────────────────────────────────────────

export interface CustomerType {
  customerTypeId: number;
  customerTypeName: string;
}

export interface CustomerAddress {
  id: number;
  label: string;
  addressLine: string;
  city?: string;
  isDefault: boolean;
}

export interface CustomerAddressWrite {
  label: string;
  addressLine: string;
  city?: string;
  isDefault?: boolean;
}

export interface Customer {
  customerId: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  customerTypeId?: number;
  customerTypeName: string;
  creditLimit?: number;
  isActive: boolean;
  photoPath?: string;
  addresses?: CustomerAddress[];
}

// ── HR / Employees ───────────────────────────────────────────────────────────

export interface Department {
  id: number;
  name: string;
  description?: string;
}

export interface Employee {
  id: number;
  fullName: string;
  email?: string;
  departmentId: number;
  departmentName?: string;
  hireDate?: string;
  salary?: number;
  isActive: boolean;
  photoPath?: string;
  photoContentType?: string;
  documents?: any[];
}

export interface EmployeeDocument {
  id: number;
  documentTitle: string;
  documentNumber?: string;
  issueDate: string;
  expiryDate?: string;
  isVerified: boolean;
}

export interface EmployeeDocumentWrite {
  documentTitle: string;
  documentNumber?: string;
  issueDate: string;
  expiryDate?: string;
  isVerified?: boolean;
}

// ── Accounting / Ledger ──────────────────────────────────────────────────────

export interface ChartOfAccount {
  id: number;
  code?: string;
  name: string;
  accountType: string;
  parentId?: number;
  parentName?: string;
  isActive: boolean;
}

export interface CompanyAsset {
  id: number;
  name: string;
  acquiredDate?: string;
  value: number;
  bookValue: number;
  depreciationRatePercent?: number;
  isActive: boolean;
  disposalDate?: string;
}

// DepreciationMethod enum on the backend has no JsonStringEnumConverter, so
// it serializes/deserializes as its underlying int.
export const DEPRECIATION_METHODS = [
  { value: 0, label: 'Straight Line' },
  { value: 1, label: 'Reducing Balance' },
];

export interface CompanyAssetCreate {
  name: string;
  value: number;
  acquiredDate: string;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationRatePercent: number;
  depreciationMethod: number;
  description?: string;
  isActive: boolean;
}

export interface CompanyLiability {
  id: number;
  name: string;
  liabilityType?: number;
  dueDate?: string;
  amount: number;
  outstandingAmount: number;
  isActive: boolean;
}

// LiabilityType enum — also int-serialized (no JsonStringEnumConverter).
export const LIABILITY_TYPES = [
  { value: 0, label: 'Loan' },
  { value: 1, label: 'Credit Card' },
  { value: 2, label: 'Lease' },
  { value: 3, label: 'Tax Payable' },
  { value: 4, label: 'Other' },
];

export interface CompanyLiabilityCreate {
  name: string;
  liabilityType: number;
  amount: number;
  liabilityDate: string;
  dueDate?: string;
  interestRate: number;
  description?: string;
  isActive: boolean;
}

// Full detail from GET /companyassets/{id} — used to pre-fill the edit dialog
// (the mapped CompanyAsset list-row shape drops salvageValue/usefulLifeYears/description).
export interface CompanyAssetDetail {
  id: number;
  name: string;
  value: number;
  acquiredDate: string;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationRatePercent: number;
  depreciationMethod: number;
  description?: string;
  isActive: boolean;
}

export interface CompanyLiabilityDetail {
  id: number;
  name: string;
  liabilityType: number;
  amount: number;
  liabilityDate: string;
  dueDate?: string;
  interestRate: number;
  description?: string;
  isActive: boolean;
}

export interface LedgerAccount {
  id: number;
  chartOfAccountId: number;
  chartOfAccountName: string;
  transactionDate: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  voucherNo?: string;
  isReversed?: boolean;
}

export interface JournalLineWrite {
  chartOfAccountId: number | null;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

export interface JournalEntryCreate {
  voucherNo?: string;
  transactionDate?: string;
  description?: string;
  lines: JournalLineWrite[];
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalProducts: number;
  todaySales: number;
  lowStockCount: number;
  totalCustomers: number;
  pendingPurchases: number;
}

// ── Returns ──────────────────────────────────────────────────────────────────

export interface PurchaseReturnItemRead {
  id: number;
  productId: number;
  productName?: string;
  unitId: number;
  unitName?: string;
  quantity: number;
  baseQuantity: number;
  unitCost: number;
  subTotal: number;
}

export interface PurchaseReturnItemCreate {
  purchaseInvoiceItemId: number;
  quantity: number;
}

export interface PurchaseReturnReceive {
  id: number;
  receivedAmount: number;
  receivedDate: string;
  paymentMethod: string;
  note?: string;
}

export interface PurchaseReturnReceiveCreate {
  receivedAmount: number;
  receivedDate: string;
  paymentMethod: string;
  note?: string;
}

export interface PurchaseReturn {
  id: number;
  returnNo: string;
  returnDate: string;
  purchaseInvoiceId: number;
  returnTotal: number;
  reason?: string;
  isCompleted: boolean;
  receiptImagePath?: string;
  receiptImage?: string;
  receiptImageContentType?: string;
  items: PurchaseReturnItemRead[];
  receives: PurchaseReturnReceive[];
}

export interface PurchaseReturnCreate {
  returnNo: string;
  returnDate: string;
  purchaseInvoiceId: number;
  reason?: string;
  receiptImagePath?: string;
  items: PurchaseReturnItemCreate[];
  receives?: PurchaseReturnReceiveCreate[];
}

export interface PurchaseReturnUpdate {
  reason?: string;
  isCompleted: boolean;
  receiptImagePath?: string;
}

export interface SaleReturnItemRead {
  id: number;
  medicineId: number;
  medicineName?: string;
  unitId: number;
  unitName?: string;
  quantity: number;
  baseQuantity: number;
  salesPrice: number;
  subTotal: number;
}

export interface SaleReturnItemCreate {
  saleItemId: number;
  quantity: number;
  /** Optional: packaging this quantity is expressed in (e.g. Pcs instead of
  * the Strip it was sold as). Must be the product's base unit or one of its
  * configured packagings. Omit to return in the unit it was sold in. */
  unitId?: number;
}

export interface SaleReturn {
  id: number;
  returnNo: string;
  returnDate: string;
  saleId: number;
  returnTotal: number;
  reason?: string;
  isDeleted: boolean;
  receiptImagePath?: string;
  receiptImage?: string;
  receiptImageContentType?: string;
  items: SaleReturnItemRead[];
  /** Amount first applied against outstanding sale due. */
  appliedToDue: number;
  refundedAmount: number;
  customerCredit: number;
  refunds: SaleReturnRefund[];
}

export interface SaleReturnRefund {
  id: number;
  amount: number;
  paymentMethod: string;
  refundedAt: string;
  note?: string;
}

export interface SaleReturnCreate {
  returnNo: string;
  returnDate: string;
  saleId: number;
  reason?: string;
  receiptImagePath?: string;
  items: SaleReturnItemCreate[];
}

export interface SaleReturnUpdate {
  reason?: string;
  receiptImagePath?: string;
}

// ── Expired Product Stocks ────────────────────────────────────────────────────

export interface ExpiredProductStockCreate {
  productStockId: number;
  quantity: number;
  disposalMethod: string;
  note?: string;
}

export interface ExpiredProductStockRead {
  id: number;
  productId: number;
  productName: string;
  productStockId: number;
  batchNumber: string;
  expiryDate: string;
  warehouseId: number;
  warehouseName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  disposalMethod: string;
  disposalDate: string;
  requestedByUserId: number;
  requestedByName: string;
  approvedByUserId?: number;
  approvedByName?: string;
  approvedDate?: string;
  approvalStatus: 'Approved' | 'PendingApproval' | 'Rejected';
  rejectionReason?: string;
  note?: string;
}

export interface ProductStockListItem {
  id: number;
  productId: number;
  productName: string;
  productCode: string;
  productImagePath?: string;
  genericName?: string;
  strength: string;
  brandType?: BrandType;
  companyName?: string;
  dosageFormName?: string;
  unitId: number;
  unitName: string;
  warehouseId: number;
  batchNumber: string;
  availableQuantity: number;
  quantity: number;
  expiryDate: string;
  manufacturingDate?: string;
  receivedDate: string;
  unitCost: number;
  salePrice: number;
  warehouseName: string;
  packagings: ProductPackaging[];
  // Total units of this Product ever sold — powers the "Popularity" sort
  // on the Sale form's Alternate Brands list.
  popularityScore: number;
}

// ── Purchase Orders ──────────────────────────────────────────────────────────
// Backend enums (PharmacyV2.Enums) are NOT string-converted, so they travel
// as plain numbers over the wire — keep these value sets in sync with the
// C# enum declaration order.

export const PURCHASE_ORDER_SOURCES = ["Auto", "Manual"] as const;
export type PurchaseOrderSource = 0 | 1; // Auto = 0, Manual = 1

export const PURCHASE_ORDER_STATUSES = [
  "Draft",
  "PendingCheck",
  "Checked",
  "Converted",
  "Cancelled",
] as const;
export type PurchaseOrderStatus = 0 | 1 | 2 | 3 | 4;

export interface PurchaseOrderItem {
  id: number;
  productId: number;
  productName?: string;
  unitId: number;
  unitName?: string;
  lastPurchasePrice: number;
  stockQty: number;
  requiredQty: number;
  orderQty: number;
  previouslyReceivedQty?: number;
  remainingQty?: number;
  isCancelled: boolean;
}

export interface PurchaseOrderItemWrite {
  id?: number;
  productId: number;
  unitId: number;
  lastPurchasePrice: number;
  stockQty: number;
  requiredQty: number;
  orderQty: number;
  isCancelled: boolean;
}

export interface PurchaseOrder {
  id: number;
  orderNo: string;
  orderDate: string;
  requirementDate?: string;
  supplierId: number;
  supplierName?: string;
  supplierTypeId?: number;
  supplierTypeName?: string;
  source: PurchaseOrderSource;
  status: PurchaseOrderStatus;
  isUrgent: boolean;
  createdAt: string;
  receiptImagePath?: string;
  receiptImageContentType?: string;
  items: PurchaseOrderItem[];
}

// POST body — orderNo optional, leave blank to auto-generate server-side.
export interface PurchaseOrderCreate {
  orderNo?: string;
  orderDate: string;
  requirementDate?: string;
  supplierId: number;
  supplierTypeId?: number;
  source: PurchaseOrderSource;
  status: PurchaseOrderStatus;
  isUrgent: boolean;
  receiptImagePath?: string;
  receiptImageContentType?: string;
  items: PurchaseOrderItemWrite[];
}

// PUT body — header fields only; items go through the /items sub-endpoints.
export interface PurchaseOrderUpdate {
  supplierId: number;
  supplierTypeId?: number;
  source: PurchaseOrderSource;
  status: PurchaseOrderStatus;
  isUrgent: boolean;
  requirementDate?: string;
}

export interface ProductStockListItem {
  id: number;
  productId: number;
  productName: string;
  productCode: string;
  productImagePath?: string;
  genericName?: string;
  strength: string;
  brandType?: BrandType;
  companyId?: number;
  companyName?: string;
  dosageFormId?: number;
  dosageFormName?: string;
  supplierId?: number;
  supplierName?: string;
  requiresPrescription?: boolean;
  unitId: number;
  unitName: string;
  warehouseId: number;
  batchNumber: string;
  availableQuantity: number;
  quantity: number;
  expiryDate: string;
  receivedDate: string;
  unitCost: number;
  salePrice: number;
  warehouseName: string;
  packagings: ProductPackaging[];
  popularityScore: number;
}

// ── Doctors & Prescriptions ──────────────────────────────────────────────────

export interface Doctor {
  doctorId: number;
  name: string;
  specialization?: string;
  registrationNo?: string;
  hospital?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  prescriptionCount: number;
}

export interface DoctorWrite {
  name: string;
  specialization?: string;
  registrationNo?: string;
  hospital?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
}

export interface PrescriptionItem {
  id: number;
  productId?: number;
  productName?: string;
  medicineName: string;
  dosage?: string;
  duration?: string;
  instructions?: string;
}

export interface PrescriptionItemWrite {
  id?: number; // present on update to keep/edit an existing line; omit/0 to add a new one
  productId?: number;
  medicineName: string;
  dosage?: string;
  duration?: string;
  instructions?: string;
}

export interface Prescription {
  prescriptionId: number;
  doctorId: number;
  doctorName?: string;
  customerId: number;
  customerName?: string;
  prescriptionDate: string;
  diagnosis?: string;
  notes?: string;
  imagePath?: string;
  imageContentType?: string;
  saleId?: number;
  createdAt: string;
  items: PrescriptionItem[];
}

export interface PrescriptionCreate {
  doctorId: number;
  customerId: number;
  prescriptionDate?: string;
  diagnosis?: string;
  notes?: string;
  saleId?: number;
  items?: PrescriptionItemWrite[];
}

export interface PrescriptionUpdate {
  doctorId: number;
  customerId: number;
  prescriptionDate?: string;
  diagnosis?: string;
  notes?: string;
  saleId?: number;
  items?: PrescriptionItemWrite[];
}


// ----- Warehouse 

export interface WarehouseType {
  id: number;
  name: string;
  warehouseCount: number;
}

export interface WarehouseFull {
  id: number;
  name: string;
  address?: string;
  isActive: boolean;
  capacity: number;
  establishedDate?: string;
  hasPhoto: boolean;
  photoContentType?: string;
  warehouseTypeId: number;
  warehouseTypeName: string;
}

export interface WarehouseWrite {
  name: string;
  address?: string;
  isActive: boolean;
  capacity: number;
  establishedDate?: string | null;
  warehouseTypeId: number;
}

export interface ProductRakItem {
  id: number;
  name: string;
  isActive: boolean;
  warehouseId: number;
  warehouseName: string;
  stockRowCount: number;
  capacity?: number;
}

export interface ProductRakWrite {
  name: string;
  isActive: boolean;
  warehouseId: number;
  capacity?: number;
}

export interface StockTransferItem {
  id: number;
  medicineId: number;
  sourceProductStockId: number;
  medicineName?: string;
  quantity: number;
  expireDate?: string;
}

export interface StockTransferItemWrite {
  medicineId: number;
  sourceProductStockId: number;
  quantity: number;
  expireDate?: string;
}

export interface StockTransfer {
  id: number;
  invoiceId: string;
  transferDate: string;
  fromWarehouseId: number;
  fromWarehouseName?: string;
  toWarehouseId: number;
  toWarehouseName?: string;
  totalQty: number;
  createdByUserId: number;
  isReceived: boolean;
  hasReceiptImage: boolean;
  receiptImageUrl?: string;
  receiptImageContentType?: string;
  items: StockTransferItem[];
}

export interface StockTransferCreate {
  invoiceId: string;
  transferDate?: string;
  fromWarehouseId: number;
  toWarehouseId: number;
  createdByUserId?: number;
  items: StockTransferItemWrite[];
}

// ── SMS audit log ────────────────────────────────────────────────────────────
// Records the outcome of SMS sends performed elsewhere (the backend has no
// gateway configured); this is a queryable history, not a send queue.

export interface SmsLog {
  id: number;
  phoneNumber: string;
  message: string;
  sentAt: string;
  isSuccess: boolean;
  response?: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  ledgerAccountCode?: string | null;
  isActive: boolean;
}

export interface ActivityLog {
  id: number;
  userId?: number | null;
  username: string;
  fullName: string;
  roleName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  occurredAtUtc: string;
}

export interface SmsLogCreate {
  phoneNumber: string;
  message: string;
  isSuccess: boolean;
  response?: string;
}

export interface SmsLogPurgeResult {
  deleted: number;
  cutoffDate: string;
}
