using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Branch;

namespace PharmacyV2.Controllers
{
    // CRUD for Warehouse (branch/store locations) + a photo endpoint pair.
    // Had a model + DbSet + WarehouseWriteDto/ReadDto already, but no
    // controller — WarehouseTypesController only manages the lookup type,
    // not the warehouse itself.
    //
    // Photo storage: unlike Supplier/Customer/Employee (which moved to
    // path-based files on disk with a PhotoPath column), Warehouse only has
    // Photo (byte[]) + PhotoContentType — no PhotoPath — so photos are kept
    // as raw bytes in the DB and streamed back directly.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class WarehousesController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public WarehousesController(PharmacyDbContext db)
        {
            _db = db;
        }

        // GET api/warehouses
        [HttpGet]
        public async Task<ActionResult<IEnumerable<WarehouseListItemDto>>> GetAll()
        {
            var warehouses = await _db.Warehouses
                .AsNoTracking()
                .Include(w => w.WarehouseType)
                .OrderBy(w => w.Name)
                .Select(w => new WarehouseListItemDto
                {
                    Id = w.Id,
                    Name = w.Name,
                    Address = w.Address,
                    IsActive = w.IsActive,
                    Capacity = w.Capacity,
                    EstablishedDate = w.EstablishedDate,
                    HasPhoto = w.Photo != null,
                    WarehouseTypeId = w.WarehouseTypeId,
                    WarehouseTypeName = w.WarehouseType.Name
                })
                .ToListAsync();

            return Ok(warehouses);
        }

        // GET api/warehouses/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<WarehouseReadDto>> GetById(int id)
        {
            var warehouse = await _db.Warehouses
                .AsNoTracking()
                .Include(w => w.WarehouseType)
                .FirstOrDefaultAsync(w => w.Id == id);

            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            return Ok(MapToReadDto(warehouse));
        }

        // POST api/warehouses — Name is globally unique (DB index).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<WarehouseReadDto>> Create([FromBody] WarehouseWriteDto dto)
        {
            if (!await _db.WarehouseTypes.AnyAsync(t => t.Id == dto.WarehouseTypeId))
                return BadRequestResponse($"Warehouse type {dto.WarehouseTypeId} does not exist.");

            if (await _db.Warehouses.AnyAsync(w => w.Name == dto.Name))
                return ConflictResponse($"Warehouse '{dto.Name}' already exists.");

            var warehouse = new Warehouse
            {
                Name = dto.Name,
                Address = dto.Address,
                IsActive = dto.IsActive,
                Capacity = dto.Capacity,
                EstablishedDate = dto.EstablishedDate,
                WarehouseTypeId = dto.WarehouseTypeId
            };

            _db.Warehouses.Add(warehouse);
            await _db.SaveChangesAsync();

            await _db.Entry(warehouse).Reference(w => w.WarehouseType).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, MapToReadDto(warehouse));
        }

        // PUT api/warehouses/5
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] WarehouseWriteDto dto)
        {
            var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == id);
            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            if (!await _db.WarehouseTypes.AnyAsync(t => t.Id == dto.WarehouseTypeId))
                return BadRequestResponse($"Warehouse type {dto.WarehouseTypeId} does not exist.");

            if (await _db.Warehouses.AnyAsync(w => w.Name == dto.Name && w.Id != id))
                return ConflictResponse($"Warehouse '{dto.Name}' already exists.");

            warehouse.Name = dto.Name;
            warehouse.Address = dto.Address;
            warehouse.IsActive = dto.IsActive;
            warehouse.Capacity = dto.Capacity;
            warehouse.EstablishedDate = dto.EstablishedDate;
            warehouse.WarehouseTypeId = dto.WarehouseTypeId;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/warehouses/5 — blocked once anything actually depends on
        // this warehouse (stock, racks, purchases, transfers), matching the
        // Restrict FKs configured in PharmacyDbContext — checked here first
        // so the caller gets a friendly message instead of a raw SQL error.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var warehouse = await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == id);
            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            if (await _db.ProductStocks.AnyAsync(s => s.WarehouseId == id))
                return ConflictResponse("Cannot delete a warehouse with existing stock.");

            if (await _db.ProductRaks.AnyAsync(r => r.WarehouseId == id))
                return ConflictResponse("Cannot delete a warehouse with existing racks.");

            if (await _db.PurchaseInvoices.AnyAsync(p => p.WarehouseId == id))
                return ConflictResponse("Cannot delete a warehouse with existing purchase invoices.");

            if (await _db.StockTransfers.AnyAsync(t => t.FromWarehouseId == id || t.ToWarehouseId == id))
                return ConflictResponse("Cannot delete a warehouse with existing stock transfers.");

            _db.Warehouses.Remove(warehouse);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST api/warehouses/5/photo — upload/replace, stored as raw bytes
        // in the DB (see class-level comment). Postman: Body -> form-data ->
        // key "file", type "File" -> pick an image from disk.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/photo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadPhoto(int id, IFormFile file)
        {
            var warehouse = await _db.Warehouses.FindAsync(id);
            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            if (file is null || file.Length == 0)
                return BadRequestResponse("No file was uploaded. Send it as form-data with key 'file'.");

            string extension = Path.GetExtension(file.FileName);
            string[] allowed = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
            if (string.IsNullOrWhiteSpace(extension) || !allowed.Contains(extension, StringComparer.OrdinalIgnoreCase))
                return BadRequestResponse("Unsupported image type. Allowed: jpg, jpeg, png, gif, webp, bmp.");

            using var stream = new MemoryStream();
            await file.CopyToAsync(stream);

            warehouse.Photo = stream.ToArray();
            warehouse.PhotoContentType = file.ContentType;

            await _db.SaveChangesAsync();
            return Ok(new { warehouse.Id, HasPhoto = true });
        }

        // GET api/warehouses/5/photo — streams the raw bytes back.
        [HttpGet("{id:int}/photo")]
        public async Task<IActionResult> GetPhoto(int id)
        {
            var warehouse = await _db.Warehouses.AsNoTracking()
                .Where(w => w.Id == id)
                .Select(w => new { w.Photo, w.PhotoContentType })
                .FirstOrDefaultAsync();

            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            if (warehouse.Photo is null || warehouse.Photo.Length == 0)
                return NotFoundResponse($"Warehouse {id} has no photo.");

            return File(warehouse.Photo, warehouse.PhotoContentType ?? "application/octet-stream");
        }

        // DELETE api/warehouses/5/photo
        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}/photo")]
        public async Task<IActionResult> DeletePhoto(int id)
        {
            var warehouse = await _db.Warehouses.FindAsync(id);
            if (warehouse is null)
                return NotFoundResponse($"Warehouse {id} not found.");

            warehouse.Photo = null;
            warehouse.PhotoContentType = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        private static WarehouseReadDto MapToReadDto(Warehouse w) => new()
        {
            Id = w.Id,
            Name = w.Name,
            Address = w.Address,
            IsActive = w.IsActive,
            Capacity = w.Capacity,
            EstablishedDate = w.EstablishedDate,
            HasPhoto = w.Photo != null,
            PhotoContentType = w.PhotoContentType,
            WarehouseTypeId = w.WarehouseTypeId,
            WarehouseTypeName = w.WarehouseType?.Name ?? string.Empty
        };

        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}