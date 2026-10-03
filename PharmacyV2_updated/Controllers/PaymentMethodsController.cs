using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Accounts;
using PharmacyV2.Models.Payment;

namespace PharmacyV2.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PaymentMethodsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        public PaymentMethodsController(PharmacyDbContext db) => _db = db;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<PaymentMethodReadDto>>> GetAll()
        {
            var items = await _db.PaymentMethods.AsNoTracking().OrderBy(p => p.Name).ToListAsync();
            return Ok(items.Select(ToDto));
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<PaymentMethodReadDto>> GetById(int id)
        {
            var item = await _db.PaymentMethods.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            return item is null ? NotFound(new ApiError($"Payment method {id} not found.")) : Ok(ToDto(item));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<PaymentMethodReadDto>> Create([FromBody] PaymentMethodWriteDto dto)
        {
            var name = dto.Name.Trim();
            if (await _db.PaymentMethods.AnyAsync(p => p.Name == name))
                return Conflict(new ApiError($"Payment method '{name}' already exists."));

            var account = await FindPostingAccountAsync(dto.LedgerAccountCode);
            if (account is null)
                return BadRequest(new ApiError("Choose an active Asset account from the Chart of Accounts for this payment method."));

            var item = new PaymentMethod { Name = name, LedgerAccountCode = account.Code, IsActive = dto.IsActive };
            _db.PaymentMethods.Add(item);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = item.Id }, ToDto(item));
        }

        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PaymentMethodWriteDto dto)
        {
            var item = await _db.PaymentMethods.FirstOrDefaultAsync(p => p.Id == id);
            if (item is null) return NotFound(new ApiError($"Payment method {id} not found."));

            var name = dto.Name.Trim();
            if (await _db.PaymentMethods.AnyAsync(p => p.Name == name && p.Id != id))
                return Conflict(new ApiError($"Payment method '{name}' already exists."));

            var account = await FindPostingAccountAsync(dto.LedgerAccountCode);
            if (account is null)
                return BadRequest(new ApiError("Choose an active Asset account from the Chart of Accounts for this payment method."));

            item.Name = name;
            item.LedgerAccountCode = account.Code;
            item.IsActive = dto.IsActive;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var item = await _db.PaymentMethods.FirstOrDefaultAsync(p => p.Id == id);
            if (item is null) return NotFound(new ApiError($"Payment method {id} not found."));


            item.IsActive = false;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private static PaymentMethodReadDto ToDto(PaymentMethod p) => new()
        {
            Id = p.Id,
            Name = p.Name,
            LedgerAccountCode = p.LedgerAccountCode,
            IsActive = p.IsActive
        };

        private Task<ChartOfAccount?> FindPostingAccountAsync(string code) =>
            _db.ChartOfAccounts.FirstOrDefaultAsync(account =>
                account.Code == code.Trim() && account.IsActive && account.AccountType == "Asset");
    }
}
