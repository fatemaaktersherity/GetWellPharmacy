using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product;

/// <summary>A division or business unit owned by a parent company.</summary>
public class CompanyDivision
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public Company Company { get; set; } = null!;
    [Required, MaxLength(150)] public string Name { get; set; } = string.Empty;
}
