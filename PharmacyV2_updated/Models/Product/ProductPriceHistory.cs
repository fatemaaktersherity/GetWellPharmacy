using PharmacyV2.Models.People;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PharmacyV2.Models.Product;

public class ProductPriceHistory
{
    [Key] public int Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    [MaxLength(30)] public string PriceType { get; set; } = string.Empty;
    public int? UnitId { get; set; }
    public Unit? Unit { get; set; }

    // When set, this history row is scoped to one supplier's price for this
    // product+unit (SupplierProductPrice changes) rather than the product's
    // own master/packaging price. Null = product-level change, as before.
    public int? SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal? PreviousPrice { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal NewPrice { get; set; }
    [Column(TypeName = "decimal(18,4)")] public decimal? PreviousBaseQuantity { get; set; }
    [Column(TypeName = "decimal(18,4)")] public decimal? NewBaseQuantity { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
