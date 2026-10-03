using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Purchase
{
    public class PurchaseReturn
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string ReturnNo { get; set; } = string.Empty;

        public DateTime ReturnDate { get; set; } = DateTime.Now;

        public int PurchaseInvoiceId { get; set; }
        public PurchaseInvoice PurchaseInvoice { get; set; } = null!;

        [Column(TypeName = "decimal(18,2)")]
        public decimal ReturnTotal { get; set; }

        [MaxLength(500)]
        public string? Reason { get; set; }

        // ----- boolean -----
        // True once the return is fully processed — items handed back to the
        // supplier and the corresponding refund/credit received (see Receives
        // below). False (default) while it's still open/in progress.
        public bool IsCompleted { get; set; } = false;

        // Scanned/photographed return slip/credit note attached to this return.
        // Same optional path/bytes/content-type pattern as Product's image fields —
        // all three are nullable and default to null, so existing returns and any
        // caller that doesn't supply a receipt keep working without change.
        [MaxLength(500)]
        public string? ReceiptImagePath { get; set; }

        public byte[]? ReceiptImage { get; set; }

        [MaxLength(100)]
        public string? ReceiptImageContentType { get; set; }

        public ICollection<PurchaseReturnItem> Items { get; set; } = new List<PurchaseReturnItem>();
        public ICollection<PurchaseReturnReceive> Receives { get; set; } = new List<PurchaseReturnReceive>();
    }
}
