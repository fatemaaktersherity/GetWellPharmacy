using Microsoft.AspNetCore.Mvc.Rendering;
using PharmacyV2.Models.Product;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Product
{
    // This class represents the price of a product for a specific unit.
    public class ProductPrice
    {
        [Key]
        public int Id { get; set; }

        public int ProductId { get; set; }
        public Product Product { get; set; } = null!;

        public int UnitId { get; set; }
        public virtual Unit Unit { get; set; } = null!;      
        //dropdown box showing all units of the product, user can select any unit for price entry like box, strip, bottle etc. and then enter the price for that unit.

        // A pack can have a meaningful name beyond its unit, for example
        // "60 ml bottle (Raspberry)".  This also permits multiple Bottle
        // variants for one product, each with its own price.
        [Required, MaxLength(150)]
        public string DisplayName { get; set; } = string.Empty;

        // General list/unit price for this unit (kept for backward
        // compatibility with existing callers that only ever set one price).
        [Column(TypeName = "decimal(18,4)")]
        public decimal PerUnitPrice { get; set; }
        [Column(TypeName = "decimal(18,4)")]
        public decimal BaseQuantity { get; set; } = 1;
        //according to the selected unit, the price will be entered for that unit. For example, if the user selects "box" as the unit, then the price entered will be for one box of the product.

        // Purchase (cost) price and sale (retail) price, independent per
        // unit. This is what fixes the "everything falls back to the Pcs
        // price" bug: a Box no longer inherits PurchasePrice/SalePrice from
        // the master Product row, it has its own values here. Nullable so
        // existing rows / callers that only fill PerUnitPrice keep working —
        // when null, callers should fall back to PerUnitPrice.
        [Column(TypeName = "decimal(18,4)")]
        public decimal? PurchasePrice { get; set; }

        [Column(TypeName = "decimal(18,4)")]
        public decimal? SalePrice { get; set; }

        [Column(TypeName = "decimal(18,4)")]
        public decimal? DistributorPrice { get; set; }
    }
}
