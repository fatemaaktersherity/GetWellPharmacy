using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.People
{
    // Lookup table for Customer.CustomerTypeId. No controller — seeded via
    // HasData() in PharmacyDbContext, same pattern as Unit and Department.
    public class CustomerType
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Name { get; set; } = string.Empty;

        public List<Customer> Customers { get; set; } = new();
    }
}
