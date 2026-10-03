using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    // Detail record — many line items belong to one PurchaseInvoice (master).
    // This was previously missing: PurchaseInvoice had no way to record which
    // products/quantities were actually received against an invoice. Managed
    // through PurchaseInvoicesController (nested create/update, plus
    // dedicated /items endpoints), same shape as PurchaseOrder/PurchaseOrderItem.
    public class PurchaseInvoiceItem
    {
        public int Id { get; set; }

        public int PurchaseInvoiceId { get; set; }
        public PurchaseInvoice PurchaseInvoice { get; set; } = null!;

        public int ProductId { get; set; }
        public Product.Product Product { get; set; } = null!;

        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        // Quantity actually received against this invoice line, entered when the
        // invoice is recorded (goods-receipt time). Drives the line SubTotal
        // (ReceivedQty * UnitCost), the stock batch created for the line, and the
        // purchase-return limit. Compared against OrderedQty below.
        [Column(TypeName = "decimal(18,2)")]
        public decimal ReceivedQty { get; set; }

        // Snapshot of the matching PurchaseOrderItem.OrderQty at the moment this
        // line was recorded (matched by ProductId + UnitId against the invoice's
        // PurchaseInvoice.PurchaseOrderId, one order line consumed per invoice
        // line — see PurchaseInvoicesController.ConsumeOrderedQty). Null when the
        // invoice has no linked purchase order, or no order line matched this
        // product/unit. Stored here — rather than re-derived by the frontend on
        // every read by matching against live PurchaseOrder data — so the figure
        // shown in the Purchase Invoices screens can't drift if the order is
        // edited later, and doesn't require every screen to fetch and match
        // against the order client-side.
        [Column(TypeName = "decimal(18,2)")]
        public decimal? OrderedQty { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal UnitCost { get; set; }

        // Not DB-computed (unlike SaleItem.TotalPrice) — kept as a plain
        // column and set server-side in the controller as ReceivedQty * UnitCost,
        // so it stays consistent without requiring a computed-column migration.
        [Column(TypeName = "decimal(18,2)")]
        public decimal SubTotal { get; set; }

        // Optional batch/expiry tracking captured at receiving time.
        public string? BatchNumber { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public DateTime? ManufacturingDate { get; set; }
    }
}