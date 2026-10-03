using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.Models.Product
{
    //This class represents a unit of measurement for products in the pharmacy system. It includes properties for the unit's ID, name, and collections of associated products and product prices.
    public class Unit
    {
        [Key]
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Name { get; set; } = string.Empty;
        public List<Product> Products { get; set; } 
        public List<ProductPrice> ProductPrices { get; set; }
        public Unit()
        {
            Products = new List<Product>();
            ProductPrices = new List<ProductPrice>();
        }
    }
}
