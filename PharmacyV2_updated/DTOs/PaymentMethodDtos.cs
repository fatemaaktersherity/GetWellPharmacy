using System.ComponentModel.DataAnnotations;

namespace PharmacyV2.DTOs
{
    public class PaymentMethodReadDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? LedgerAccountCode { get; set; }
        public bool IsActive { get; set; }
    }

    public class PaymentMethodWriteDto
    {
        [Required, MaxLength(50)]
        public string Name { get; set; } = string.Empty;

        // Required (was optional): SalesController posts every paid sale and
        // every payment collection through this code. A method saved without
        // one used to fail silently by falling into the Cash account; now it
        // is rejected here instead, at the one place that can actually ask
        // "which account does this belong to?".
        [Required, MaxLength(20)]
        public string LedgerAccountCode { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;
    }
}