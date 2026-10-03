using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Branch;

namespace PharmacyV2.Controllers
{
    // CRUD for the WarehouseType lookup that Warehouse.WarehouseTypeId feeds
    // from. Previously seed-only (Main/Branch/Cold Storage). Pulled in as
    // part of completing Warehouse management, since Warehouse's own
    // controller (WarehousesController) can't work without this dropdown.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class WarehouseTypesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public WarehouseTypesController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/warehousetypes
        [HttpGet]
        public async Task<ActionResult<IEnumerable<WarehouseTypeReadDto>>> GetAll()
        {
            var types = await _db.WarehouseTypes
                .AsNoTracking()
                .Select(t => new WarehouseTypeReadDto { Id = t.Id, Name = t.Name, WarehouseCount = t.Warehouses.Count })
                .ToListAsync();

            return Ok(types);
        }

        // GET api/warehousetypes/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<WarehouseTypeReadDto>> GetById(int id)
        {
            var type = await _db.WarehouseTypes
                .AsNoTracking()
                .Where(t => t.Id == id)
                .Select(t => new WarehouseTypeReadDto { Id = t.Id, Name = t.Name, WarehouseCount = t.Warehouses.Count })
                .FirstOrDefaultAsync();

            if (type is null)
                return NotFoundResponse($"Warehouse type {id} not found.");

            return Ok(type);
        }

        // POST api/warehousetypes — Name must be unique (DB index).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<WarehouseTypeReadDto>> Create([FromBody] WarehouseTypeWriteDto dto)
        {
            if (await _db.WarehouseTypes.AnyAsync(t => t.Name == dto.Name))
                return ConflictResponse($"Warehouse type '{dto.Name}' already exists.");

            var type = new WarehouseType { Name = dto.Name };

            _db.WarehouseTypes.Add(type);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = type.Id },
                new WarehouseTypeReadDto { Id = type.Id, Name = type.Name, WarehouseCount = 0 });
        }

        // PUT api/warehousetypes/5
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] WarehouseTypeWriteDto dto)
        {
            var type = await _db.WarehouseTypes.FirstOrDefaultAsync(t => t.Id == id);
            if (type is null)
                return NotFoundResponse($"Warehouse type {id} not found.");

            if (await _db.WarehouseTypes.AnyAsync(t => t.Name == dto.Name && t.Id != id))
                return ConflictResponse($"Warehouse type '{dto.Name}' already exists.");

            type.Name = dto.Name;
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/warehousetypes/5 — blocked while any warehouse still references it.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var type = await _db.WarehouseTypes.FirstOrDefaultAsync(t => t.Id == id);
            if (type is null)
                return NotFoundResponse($"Warehouse type {id} not found.");

            if (await _db.Warehouses.AnyAsync(w => w.WarehouseTypeId == id))
                return ConflictResponse("Cannot delete a warehouse type with warehouses assigned to it.");

            _db.WarehouseTypes.Remove(type);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}