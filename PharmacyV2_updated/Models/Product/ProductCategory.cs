using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product;

/// <summary>Optional classification for a product group, with one optional parent level.</summary>
public sealed class ProductCategory
{
    public int Id { get; set; }

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    public int? ParentCategoryId { get; set; }
    public ProductCategory? ParentCategory { get; set; }
    public List<ProductCategory> Children { get; set; } = new();
}
