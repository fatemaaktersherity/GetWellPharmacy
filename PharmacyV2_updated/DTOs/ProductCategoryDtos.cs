using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.DTOs;

public sealed class ProductCategoryReadDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int? ParentCategoryId { get; set; }
    public string? ParentCategoryName { get; set; }
}

public sealed class ProductCategoryWriteDto
{
    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;
    public int? ParentCategoryId { get; set; }
}
