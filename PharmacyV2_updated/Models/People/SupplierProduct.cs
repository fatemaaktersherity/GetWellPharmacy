using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.People
{
    // The actual Supplier <-> Product many-to-many link. Before this, a
    // Supplier only ever touched a Product indirectly through a ProductStock
    // batch or a PurchaseInvoiceItem line — there was no direct "this
    // supplier carries these products" / "this product is supplied by these
    // suppliers" relationship, and no single place to hang per-supplier,
    // per-unit pricing off of.
    //
    // One row = "Supplier X supplies Product Y" (unique per SupplierId+ProductId).
    // The actual prices — which differ per Unit (Pcs/Box/Strip/...) and must
    // NOT just fall back to the product's flat master price — live on the
    // child SupplierProductPrice rows.
    public class SupplierProduct
    {
        [Key]
        public int Id { get; set; }

        public int SupplierId { get; set; }
        public Supplier Supplier { get; set; } = null!;

        public int ProductId { get; set; }
        public PharmacyV2.Models.Product.Product Product { get; set; } = null!;

        // Supplier's own code/reference for this product, if any.
        [MaxLength(50)]
        public string? SupplierProductCode { get; set; }

        // Lets a pharmacy mark which supplier is the go-to source for a
        // product when several suppliers carry it.
        public bool IsPreferred { get; set; } = false;

        public bool IsActive { get; set; } = true;

        // Rolled up / refreshed whenever a PurchaseInvoiceItem is posted
        // against this supplier+product, so "purchase history" is visible
        // at a glance without re-aggregating invoices every time.
        public DateTime? LastPurchaseDate { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal? LastPurchaseUnitCost { get; set; }
        public int? LastPurchaseUnitId { get; set; }

        [MaxLength(500)]
        public string? Note { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Current price per unit (Pcs / Box / Strip / Vial ...). History of
        // changes to these is written to ProductPriceHistory (SupplierId set).
        public ICollection<SupplierProductPrice> Prices { get; set; } = new List<SupplierProductPrice>();
    }
}
