using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product;

/// <summary>A sellable formulation of a ProductGroup, e.g. Napa 500 mg Tablet.</summary>
public class ProductVariant
{
    [Key]
    public int Id { get; set; }

    public int ProductGroupId { get; set; }
    public ProductGroup ProductGroup { get; set; } = null!;

    [Required, MaxLength(100)]
    public string Strength { get; set; } = string.Empty;

    public int DosageFormId { get; set; }
    public DosageForm DosageForm { get; set; } = null!;

    public List<Product> Products { get; set; } = new();
}
