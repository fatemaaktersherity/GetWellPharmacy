using PharmacyV2.Enums;
using PharmacyV2.Models.People;
using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Purchase
{
    // Where this comes from in the sheet: "Order System" (Order Main Table), "Manual Order"
    // and "Order Checking" tabs all edit/view the same header record — a purchase order
    // raised against a supplier, either generated automatically from
    // DailyPurchaseRequirementTable or entered manually via the "Manual Order" screen.

    public class PurchaseOrder
    {
        [Key]
        public int Id { get; set; }

        // "Order No" e.g. X000001 / O000001
        [Required, MaxLength(50)]
        public string OrderNo { get; set; } = string.Empty;

        // "Order Date(Hidden) / sysDate"
        public DateTime OrderDate { get; set; } = DateTime.Now;

        // "Requirement Date" — pulled from DailyPurchaseRequirementTable when auto-generated
        public DateTime? RequirementDate { get; set; }

        public int SupplierId { get; set; }
        public Supplier Supplier { get; set; } = null!;

        // "Supplier Category:" dropdown shown next to the order header
        // a proper relational FK to the same SupplierType lookup table
        // used by Supplier.SupplierTypeId. This used to be a free-text
        // `string? SupplierCategory` column that never matched the
        // `supplierTypeId` the frontend actually sends, so it silently
        // failed to bind on every save.
        public int? SupplierTypeId { get; set; }
        public SupplierType? SupplierType { get; set; }

        public PurchaseOrderSource Source { get; set; } = PurchaseOrderSource.Manual;
        public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;

        // ----- boolean -----
        // Priority flag set by the buyer, independent of the Status workflow
        // above (Draft/PendingCheck/Checked/Converted/Cancelled) — lets an
        // urgent order be picked out of a list without changing its stage.
        public bool IsUrgent { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Scanned/photographed order receipt/confirmation attached to this order.
        // Same optional path/bytes/content-type pattern as Product's image fields —
        // all three are nullable and default to null, so existing orders and any
        // caller that doesn't supply a receipt keep working without change.
        [MaxLength(500)]
        public string? ReceiptImagePath { get; set; }

        public byte[]? ReceiptImage { get; set; }

        [MaxLength(100)]
        public string? ReceiptImageContentType { get; set; }

        public ICollection<PurchaseOrderItem> Items { get; set; } = new List<PurchaseOrderItem>();

        // One order is usually converted into one purchase invoice, but a supplier could
        // deliver in more than one batch against the same order, so keep it one-to-many.
        public ICollection<PurchaseInvoice> Purchases { get; set; } = new List<PurchaseInvoice>();
    }
}

