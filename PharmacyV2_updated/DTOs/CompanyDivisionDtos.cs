using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.DTOs;

public class CompanyDivisionReadDto
{
    public int Id { get; set; }
    public int CompanyId { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class CompanyDivisionWriteDto
{
    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;
}
