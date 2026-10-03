using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Branch;
using System.Security.Claims;

namespace PharmacyV2.Controllers
{
    // Moves stock between two warehouses/branches.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockTransfersController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        public StockTransfersController(PharmacyDbContext db) => _db = db;

        // GET api/stocktransfers — every transfer with its line items.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<StockTransferReadDto>>> GetAll()
        {
            var transfers = await _db.StockTransfers
                .Include(t => t.Items).ThenInclude(i => i.Medicine)
                .Include(t => t.FromWarehouse)
                .Include(t => t.ToWarehouse)
                .AsNoTracking().ToListAsync();
            return Ok(transfers.Select(ToDto));
        }

        // GET api/stocktransfers/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<StockTransferReadDto>> GetById(int id)
        {
            var transfer = await _db.StockTransfers
                .Include(t => t.Items).ThenInclude(i => i.Medicine)
                .Include(t => t.FromWarehouse)
                .Include(t => t.ToWarehouse)
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id);
            return transfer is null ? NotFound() : Ok(ToDto(transfer));
        }

        // POST api/stocktransfers — create a transfer header + items in one call.
        // FromWarehouseId and ToWarehouseId must differ and must both exist.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<StockTransferReadDto>> Create([FromBody] StockTransferCreateDto dto)
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var createdByUserId)) return Unauthorized();
            if (dto.FromWarehouseId == dto.ToWarehouseId)
                return BadRequest(new ApiError("FromWarehouseId and ToWarehouseId must be different."));

            var warehousesExist = await _db.Warehouses
                .Where(w => w.Id == dto.FromWarehouseId || w.Id == dto.ToWarehouseId)
                .CountAsync();
            if (warehousesExist < 2)
                return BadRequest(new ApiError("One or both warehouses do not exist."));

            var transfer = new StockTransfer
            {
                InvoiceId = dto.InvoiceId,
                TransferDate = dto.TransferDate == default ? DateTime.UtcNow : dto.TransferDate,
                FromWarehouseId = dto.FromWarehouseId,
                ToWarehouseId = dto.ToWarehouseId,
                CreatedByUserId = createdByUserId,
                ReceiptImagePath = dto.ReceiptImagePath,
                ReceiptImage = dto.ReceiptImage,
                ReceiptImageContentType = dto.ReceiptImageContentType
            };

            foreach (var itemDto in dto.Items)
            {
                var source = await _db.ProductStocks.FirstOrDefaultAsync(s => s.Id == itemDto.SourceProductStockId && s.WarehouseId == dto.FromWarehouseId);
                if (source is null || source.ProductId != itemDto.MedicineId) return BadRequest(new ApiError("Selected source batch does not belong to the source warehouse/product."));
                if (source.AvailableQuantity < itemDto.Quantity) return Conflict(new ApiError("Insufficient quantity in selected source batch."));
                source.AvailableQuantity -= itemDto.Quantity;
                transfer.Items.Add(new StockTransferItem
                {
                    MedicineId = itemDto.MedicineId,
                    SourceProductStockId = source.Id,
                    Quantity = itemDto.Quantity,
                    ExpireDate = itemDto.ExpireDate
                });
                _db.ProductStocks.Add(new PharmacyV2.Models.Product.ProductStock { ProductId = source.ProductId, WarehouseId = dto.ToWarehouseId,
                    BatchNumber = $"{source.BatchNumber}-TR-{dto.InvoiceId}", Quantity = itemDto.Quantity, AvailableQuantity = itemDto.Quantity,
                    ExpiryDate = source.ExpiryDate, SupplierId = source.SupplierId, ReceivedDate = DateOnly.FromDateTime(dto.TransferDate), UnitCost = source.UnitCost });
            }

            transfer.TotalQty = transfer.Items.Sum(i => i.Quantity);

            _db.StockTransfers.Add(transfer);
            await _db.SaveChangesAsync();

            foreach (var productId in transfer.Items.Select(i => i.MedicineId).Distinct())
            {
                var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == productId);
                if (product is null) continue;
                var total = await _db.ProductStocks
                    .Where(s => s.ProductId == productId)
                    .SumAsync(s => (decimal?)s.AvailableQuantity) ?? 0;
                product.StockQuantity = (int)total;
            }
            await _db.SaveChangesAsync();

            await _db.Entry(transfer).Reference(t => t.FromWarehouse).LoadAsync();
            await _db.Entry(transfer).Reference(t => t.ToWarehouse).LoadAsync();
            await _db.Entry(transfer).Collection(t => t.Items).Query().Include(i => i.Medicine).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = transfer.Id }, ToDto(transfer));
        }

        // PUT api/stocktransfers/5 — update header notes/invoice id (items are append/remove only).
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] StockTransferUpdateDto dto)
        {
            var existing = await _db.StockTransfers.FirstOrDefaultAsync(t => t.Id == id);
            if (existing is null) return NotFound();

            existing.InvoiceId = dto.InvoiceId;
            existing.IsReceived = dto.IsReceived;

            // Receipt fields are optional on update — only overwrite when the
            // caller actually sends a value, so a PUT that omits them doesn't
            // wipe out a receipt attached earlier.
            if (dto.ReceiptImagePath is not null) existing.ReceiptImagePath = dto.ReceiptImagePath;
            if (dto.ReceiptImage is not null) existing.ReceiptImage = dto.ReceiptImage;
            if (dto.ReceiptImageContentType is not null) existing.ReceiptImageContentType = dto.ReceiptImageContentType;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/stocktransfers/5/receipt-image — serves the actual image
        // bytes with the right content-type, instead of shipping them as
        // base64 inside every JSON response. <img src="/api/stocktransfers/5/receipt-image">
        // works directly against this.
        [HttpGet("{id:int}/receipt-image")]
        public async Task<IActionResult> GetReceiptImage(int id)
        {
            var transfer = await _db.StockTransfers
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id);

            if (transfer is null) return NotFound();
            if (transfer.ReceiptImage is null || transfer.ReceiptImage.Length == 0)
                return NotFound(new ApiError("This stock transfer has no receipt image."));

            return File(transfer.ReceiptImage, transfer.ReceiptImageContentType ?? "application/octet-stream");
        }

        // POST api/stocktransfers/5/receipt-image — upload/replace the
        // receipt image as an actual file (multipart/form-data). In Postman:
        // Body -> form-data -> key "file", type "File" -> pick an image.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var transfer = await _db.StockTransfers.FirstOrDefaultAsync(t => t.Id == id);
            if (transfer is null) return NotFound(new ApiError($"Stock transfer {id} not found."));

            if (file is null || file.Length == 0)
                return BadRequest(new ApiError("No file was uploaded. Send it as form-data with key 'file'."));

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            transfer.ReceiptImage = ms.ToArray();
            transfer.ReceiptImageContentType = file.ContentType;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // ---------- Dedicated detail-row endpoints ----------

        // POST api/stocktransfers/5/items — append one line item to an existing transfer.
        // Recomputes TotalQty.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/items")]
        public async Task<ActionResult<StockTransferItemReadDto>> AddItem(int id, [FromBody] StockTransferItemWriteDto dto)
        {
            var transfer = await _db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
            if (transfer is null) return NotFound(new ApiError($"Stock transfer {id} not found."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.MedicineId))
                return BadRequest(new ApiError($"Product {dto.MedicineId} does not exist."));

            var item = new StockTransferItem
            {
                StockTransferId = id,
                MedicineId = dto.MedicineId,
                Quantity = dto.Quantity,
                ExpireDate = dto.ExpireDate
            };

            transfer.Items.Add(item);
            transfer.TotalQty = transfer.Items.Sum(i => i.Quantity);
            await _db.SaveChangesAsync();

            await _db.Entry(item).Reference(i => i.Medicine).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id }, new StockTransferItemReadDto
            {
                Id = item.Id,
                MedicineId = item.MedicineId,
                SourceProductStockId = item.SourceProductStockId,
                MedicineName = item.Medicine?.ProductName,
                Quantity = item.Quantity,
                ExpireDate = item.ExpireDate
            });
        }

        // PUT api/stocktransfers/5/items/12 — update a single line item.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> UpdateItem(int id, int itemId, [FromBody] StockTransferItemWriteDto dto)
        {
            var transfer = await _db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
            if (transfer is null) return NotFound(new ApiError($"Stock transfer {id} not found."));

            var item = transfer.Items.FirstOrDefault(i => i.Id == itemId);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found for stock transfer {id}."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.MedicineId))
                return BadRequest(new ApiError($"Product {dto.MedicineId} does not exist."));

            item.MedicineId = dto.MedicineId;
            item.Quantity = dto.Quantity;
            item.ExpireDate = dto.ExpireDate;

            transfer.TotalQty = transfer.Items.Sum(i => i.Quantity);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/stocktransfers/5/items/12 — remove a single line item. Recomputes TotalQty.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> RemoveItem(int id, int itemId)
        {
            var transfer = await _db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
            if (transfer is null) return NotFound(new ApiError($"Stock transfer {id} not found."));

            var item = transfer.Items.FirstOrDefault(i => i.Id == itemId);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found for stock transfer {id}."));

            _db.StockTransferItems.Remove(item);
            transfer.Items.Remove(item);
            transfer.TotalQty = transfer.Items.Sum(i => i.Quantity);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/stocktransfers/5
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var transfer = await _db.StockTransfers.FirstOrDefaultAsync(t => t.Id == id);
            if (transfer is null) return NotFound();

            _db.StockTransfers.Remove(transfer); // items cascade-delete with the transfer
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private static StockTransferReadDto ToDto(StockTransfer t) => new()
        {
            Id = t.Id,
            InvoiceId = t.InvoiceId,
            TransferDate = t.TransferDate,
            FromWarehouseId = t.FromWarehouseId,
            FromWarehouseName = t.FromWarehouse?.Name,
            ToWarehouseId = t.ToWarehouseId,
            ToWarehouseName = t.ToWarehouse?.Name,
            TotalQty = t.TotalQty,
            CreatedByUserId = t.CreatedByUserId,
            IsReceived = t.IsReceived,
            ReceiptImagePath = t.ReceiptImagePath,
            HasReceiptImage = t.ReceiptImage is { Length: > 0 },
            ReceiptImageUrl = (t.ReceiptImage is { Length: > 0 })
                ? $"/api/stocktransfers/{t.Id}/receipt-image"
                : null,
            ReceiptImageContentType = t.ReceiptImageContentType,
            Items = t.Items.Select(i => new StockTransferItemReadDto
            {
                Id = i.Id,
                MedicineId = i.MedicineId,
                SourceProductStockId = i.SourceProductStockId,
                MedicineName = i.Medicine?.ProductName,
                Quantity = i.Quantity,
                ExpireDate = i.ExpireDate
            }).ToList()
        };
    }
}
