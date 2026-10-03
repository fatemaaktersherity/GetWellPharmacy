using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.People
{
    // One row per (SupplierProduct, Unit) — this is what makes Napa's Pcs
    // price, Box price, Strip price, Vial price etc. all genuinely
    // independent numbers instead of everything deriving from the master
    // Product row. When a purchase invoice line is entered for this
    // Supplier + Product + Unit, PurchasePrice here is the default UnitCost,
    // and SalePrice/UnitPrice here (NOT Product.SalePrice) is what should be
    // offered as the selling price for stock received in that unit.
    public class SupplierProductPrice
    {
        [Key]
        public int Id { get; set; }

        public int SupplierProductId { get; set; }
        public SupplierProduct SupplierProduct { get; set; } = null!;

        public int UnitId { get; set; }
        public Unit Unit { get; set; } = null!;

        // How many of the product's base unit (Pcs) this Unit represents —
        // e.g. Box = 100, Strip = 10. Mirrors ProductPrice.BaseQuantity so
        // stock/quantity math is consistent regardless of which table priced
        // the line. Defaults to the Product's own ProductPrice.BaseQuantity
        // for the same Unit when not explicitly overridden.
        [Column(TypeName = "decimal(18,4)")]
        public decimal BaseQuantity { get; set; } = 1;

        // What this supplier charges the pharmacy for one of this Unit.
        [Column(TypeName = "decimal(18,4)")]
        public decimal PurchasePrice { get; set; }

        // What the pharmacy sells one of this Unit for (retail).
        [Column(TypeName = "decimal(18,4)")]
        public decimal? SalePrice { get; set; }

        // General list/unit price shown on quotes, separate from the retail
        // sale price — mirrors Product.UnitPrice but scoped to this
        // supplier + unit instead of one flat number for the whole product.
        [Column(TypeName = "decimal(18,4)")]
        public decimal? UnitPrice { get; set; }

        [Column(TypeName = "decimal(18,4)")]
        public decimal? DistributorPrice { get; set; }

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
