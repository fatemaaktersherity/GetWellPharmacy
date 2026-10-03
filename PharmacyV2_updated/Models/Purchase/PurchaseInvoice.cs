using Microsoft.AspNetCore.Mvc.Rendering;
using PharmacyV2.Models.Branch;
using PharmacyV2.Models.People;
using PharmacyV2.Models.Payment;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    public class PurchaseInvoice
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string InvoiceNo { get; set; } = string.Empty;

        public DateTime PurchaseDate { get; set; } = DateTime.Now;

        public int? SupplierId { get; set; }
        public Supplier? Supplier { get; set; } 

        // "Purchase" sheet's "Order No(Fk)" — links the invoice back to the order it
        // was raised from (via the Order Checking screen). Nullable: a purchase can
        // still be entered directly without going through the order workflow.
        public int? PurchaseOrderId { get; set; }
        public PurchaseOrder? PurchaseOrder { get; set; }

        public int WarehouseId { get; set; }
        public Warehouse Warehouse { get; set; } = null!;
        public string PaymentMethod { get; set; } = "Cash";

        [Column(TypeName = "decimal(18,2)")]
        public decimal Advance { get; set; } = 0;

        [Column(TypeName = "decimal(18,2)")]
        public decimal Due { get; set; } = 0;

        [Column(TypeName = "decimal(18,2)")]
        public decimal Total { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal Discount { get; set; } = 0;

        [Column(TypeName = "decimal(18,2)")]
        public decimal TaxOrOthers { get; set; } = 0;

        public string PaymentStatus { get; set; } = "InComplete";

        [MaxLength(30)]
        public string ReceivingStatus { get; set; } = "Completed";

        public bool IsSupplierWise { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Scanned/photographed supplier receipt or bill attached to this invoice.
        // Same optional path/bytes/content-type pattern as Product's image fields —
        // all three are nullable and default to null, so existing invoices and any
        // caller that doesn't supply a receipt keep working without change.
        [MaxLength(500)]
        public string? ReceiptImagePath { get; set; }

        public byte[]? ReceiptImage { get; set; }

        [MaxLength(100)]
        public string? ReceiptImageContentType { get; set; }

        public ICollection<PurchaseReturn> Returns { get; set; } = new List<PurchaseReturn>();

        // Details side of the PurchaseInvoice master-details pair — the
        // products/quantities actually received against this invoice.
        public ICollection<PurchaseInvoiceItem> Items { get; set; } = new List<PurchaseInvoiceItem>();

        // "Payment" / "Paid Details" rows raised against this invoice — one invoice
        // can be paid off across several vouchers (installments).
        public ICollection<SupplierPaymentDetail> PaymentAllocations { get; set; } = new List<SupplierPaymentDetail>();
    }
}
