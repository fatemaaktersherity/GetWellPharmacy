using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product;

/// <summary>
/// A medicine/brand family.  Variants beneath a group hold the valid
/// strength + dosage-form combinations, so cashiers cannot invent an
/// invalid combination while adding stock products.
/// </summary>
public class ProductGroup
{
    [Key]
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? GenericName { get; set; }

    public int? CompanyId { get; set; }
    public Company? Company { get; set; }

    public int? CompanyDivisionId { get; set; }
    public CompanyDivision? CompanyDivision { get; set; }

    public int? CategoryId { get; set; }
    public ProductCategory? Category { get; set; }

    public List<ProductVariant> Variants { get; set; } = new();
}
