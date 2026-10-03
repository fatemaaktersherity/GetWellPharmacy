using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.People;

namespace PharmacyV2.Controllers
{
    // CRUD for the SupplierType lookup that Supplier.SupplierTypeId feeds
    // from. Previously seed-only (Manufacturer/Distributor/Local Vendor).
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SupplierTypesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public SupplierTypesController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/suppliertypes
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SupplierTypeReadDto>>> GetAll()
        {
            var types = await _db.SupplierTypes
                .AsNoTracking()
                .Select(t => new SupplierTypeReadDto { Id = t.Id, Name = t.Name, SupplierCount = t.Suppliers.Count })
                .ToListAsync();

            return Ok(types);
        }

        // GET api/suppliertypes/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SupplierTypeReadDto>> GetById(int id)
        {
            var type = await _db.SupplierTypes
                .AsNoTracking()
                .Where(t => t.Id == id)
                .Select(t => new SupplierTypeReadDto { Id = t.Id, Name = t.Name, SupplierCount = t.Suppliers.Count })
                .FirstOrDefaultAsync();

            if (type is null)
                return NotFoundResponse($"Supplier type {id} not found.");

            return Ok(type);
        }

        // POST api/suppliertypes — Name must be unique (DB index).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<SupplierTypeReadDto>> Create([FromBody] SupplierTypeWriteDto dto)
        {
            if (await _db.SupplierTypes.AnyAsync(t => t.Name == dto.Name))
                return ConflictResponse($"Supplier type '{dto.Name}' already exists.");

            var type = new SupplierType { Name = dto.Name };

            _db.SupplierTypes.Add(type);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = type.Id },
                new SupplierTypeReadDto { Id = type.Id, Name = type.Name, SupplierCount = 0 });
        }

        // PUT api/suppliertypes/5
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SupplierTypeWriteDto dto)
        {
            var type = await _db.SupplierTypes.FirstOrDefaultAsync(t => t.Id == id);
            if (type is null)
                return NotFoundResponse($"Supplier type {id} not found.");

            if (await _db.SupplierTypes.AnyAsync(t => t.Name == dto.Name && t.Id != id))
                return ConflictResponse($"Supplier type '{dto.Name}' already exists.");

            type.Name = dto.Name;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/suppliertypes/5 — blocked while any supplier still references it.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var type = await _db.SupplierTypes.FirstOrDefaultAsync(t => t.Id == id);
            if (type is null)
                return NotFoundResponse($"Supplier type {id} not found.");

            if (await _db.Suppliers.AnyAsync(s => s.SupplierTypeId == id))
                return ConflictResponse("Cannot delete a supplier type with suppliers assigned to it.");

            _db.SupplierTypes.Remove(type);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}