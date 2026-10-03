using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Controllers
{
    // CRUD for the Unit lookup table. Every UnitId FK across the schema
    // (Product, ProductPrice, PurchaseOrderItem, PurchaseInvoiceItem,
    // PurchaseReturnItem, SaleItem, SaleReturnItem, DailyPurchaseRequirementTable)
    // feeds its dropdown from here — previously seed-only.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class UnitsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public UnitsController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/units
        [HttpGet]
        public async Task<ActionResult<IEnumerable<UnitReadDto>>> GetAll()
        {
            var units = await _db.Units
                .AsNoTracking()
                .Select(u => new UnitReadDto { Id = u.Id, Name = u.Name })
                .ToListAsync();

            return Ok(units);
        }

        // GET api/units/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<UnitReadDto>> GetById(int id)
        {
            var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);
            if (unit is null)
                return NotFoundResponse($"Unit {id} not found.");

            return Ok(new UnitReadDto { Id = unit.Id, Name = unit.Name });
        }

        // POST api/units — Name must be unique (DB index).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<UnitReadDto>> Create([FromBody] UnitWriteDto dto)
        {
            if (await _db.Units.AnyAsync(u => u.Name == dto.Name))
                return ConflictResponse($"Unit '{dto.Name}' already exists.");

            var unit = new Unit { Name = dto.Name };

            _db.Units.Add(unit);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = unit.Id },
                new UnitReadDto { Id = unit.Id, Name = unit.Name });
        }

        // PUT api/units/5
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] UnitWriteDto dto)
        {
            var unit = await _db.Units.FirstOrDefaultAsync(u => u.Id == id);
            if (unit is null)
                return NotFoundResponse($"Unit {id} not found.");

            if (await _db.Units.AnyAsync(u => u.Name == dto.Name && u.Id != id))
                return ConflictResponse($"Unit '{dto.Name}' already exists.");

            unit.Name = dto.Name;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/units/5 — checks the two most direct references
        // (Product, ProductPrice); any other FK (purchase/sale line items)
        // that still points at this unit will surface as a 409 from the
        // underlying Restrict constraint if this soft check misses it.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var unit = await _db.Units.FirstOrDefaultAsync(u => u.Id == id);
            if (unit is null)
                return NotFoundResponse($"Unit {id} not found.");

            if (await _db.Products.AnyAsync(p => p.UnitId == id))
                return ConflictResponse("Cannot delete a unit that products are using.");

            if (await _db.ProductPrices.AnyAsync(pp => pp.UnitId == id))
                return ConflictResponse("Cannot delete a unit that product prices are using.");

            try
            {
                _db.Units.Remove(unit);
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return ConflictResponse("Cannot delete this unit — it is still referenced by purchase or sale records.");
            }

            return NoContent();
        }

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}