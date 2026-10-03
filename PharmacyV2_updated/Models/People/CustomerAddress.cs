using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    // Detail record — many addresses belong to one Customer (master).
    // Managed through CustomersController (nested create/update, plus
    // dedicated /addresses endpoints), same shape as Employee/EmployeeDocument.
    public class CustomerAddress
    {
        [Key]
        public int Id { get; set; }

        public int CustomerId { get; set; }
        public Customer Customer { get; set; } = null!;

        [Required, MaxLength(50)]
        public string Label { get; set; } = string.Empty; // e.g. "Home", "Office"

        [Required, MaxLength(250)]
        public string AddressLine { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? City { get; set; }

        public bool IsDefault { get; set; } = false;
    }
}
