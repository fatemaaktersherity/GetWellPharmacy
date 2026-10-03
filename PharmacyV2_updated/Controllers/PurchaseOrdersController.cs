using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Enums;
using PharmacyV2.Models.Purchase;
using PharmacyV2.Services;

namespace PharmacyV2.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PurchaseOrdersController : ControllerBase
    {
        private readonly PharmacyDbContext _db;
        private readonly ICodeGeneratorService _codeGenerator;
        private readonly IWebHostEnvironment _env;
        private readonly PurchaseOrderReceivingService _receiving;

        private const string PurchaseOrderReceiptImagesRelativeFolder = "images/purchase-order-receipts";

        public PurchaseOrdersController(PharmacyDbContext db, ICodeGeneratorService codeGenerator, IWebHostEnvironment env, PurchaseOrderReceivingService receiving)
        {
            _db = db;
            _codeGenerator = codeGenerator;
            _env = env;
            _receiving = receiving;
        }

        private string GetPurchaseOrderReceiptImagesFolderPath()
        {
            string webRoot = _env.WebRootPath;
            if (string.IsNullOrEmpty(webRoot))
            {
                webRoot = Path.Combine(_env.ContentRootPath, "wwwroot");
            }

            string folderPath = Path.Combine(webRoot, "images", "purchase-order-receipts");

            if (!Directory.Exists(folderPath))
            {
                Directory.CreateDirectory(folderPath);
            }

            return folderPath;
        }

        private void DeleteReceiptImageFile(string? receiptImagePath)
        {
            if (string.IsNullOrWhiteSpace(receiptImagePath)) return;
            if (receiptImagePath.IndexOf(PurchaseOrderReceiptImagesRelativeFolder, StringComparison.OrdinalIgnoreCase) < 0) return;

            string folderPath = GetPurchaseOrderReceiptImagesFolderPath();
            string fileName = Path.GetFileName(receiptImagePath);
            string fullFilePath = Path.Combine(folderPath, fileName);

            if (System.IO.File.Exists(fullFilePath))
            {
                System.IO.File.Delete(fullFilePath);
            }
        }

        // GET api/purchaseorders — all orders with their line items.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<PurchaseOrderReadDto>>> GetAll()
        {
            var orders = await _db.PurchaseOrders
                .Include(o => o.Items).ThenInclude(i => i.Product)
                .Include(o => o.Items).ThenInclude(i => i.Unit)
                .Include(o => o.Supplier)
                .Include(o => o.SupplierType)
                .AsNoTracking().ToListAsync();
            var result = new List<PurchaseOrderReadDto>(orders.Count);
            foreach (var order in orders)
            {
                var dto = ToDto(order);
                dto.Status = await _receiving.GetEffectiveStatusAsync(order);
                await PopulateReceivingProgressAsync(dto);
                result.Add(dto);
            }
            return Ok(result);
        }

        // GET api/purchaseorders/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<PurchaseOrderReadDto>> GetById(int id)
        {
            var order = await _db.PurchaseOrders
                .Include(o => o.Items).ThenInclude(i => i.Product)
                .Include(o => o.Items).ThenInclude(i => i.Unit)
                .Include(o => o.Supplier)
                .Include(o => o.SupplierType)
                .AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == id);
            if (order is null) return NotFound();
            var dto = ToDto(order);
            dto.Status = await _receiving.GetEffectiveStatusAsync(order);
            await PopulateReceivingProgressAsync(dto);
            return Ok(dto);
        }

        // POST api/purchaseorders — create an order header plus its items in one call.
        // OrderNo must be unique; each item's ProductId/UnitId must already exist.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<PurchaseOrderReadDto>> Create([FromBody] PurchaseOrderCreateDto dto)
        {
            if (dto.Status == PurchaseOrderStatus.Converted)
                return BadRequest(new ApiError("Purchase orders are converted automatically when a purchase invoice is created."));

            string orderNo;

            if (string.IsNullOrWhiteSpace(dto.OrderNo))
            {
                orderNo = await _codeGenerator.GeneratePurchaseOrderNoAsync();
            }
            else
            {
                orderNo = dto.OrderNo.Trim();
                if (await _db.PurchaseOrders.AnyAsync(o => o.OrderNo == orderNo))
                    return Conflict(new ApiError($"Order number '{orderNo}' already exists."));
            }

            if (!await _db.Suppliers.AnyAsync(s => s.SupplierId == dto.SupplierId))
                return BadRequest(new ApiError($"Supplier {dto.SupplierId} does not exist."));

            if (dto.SupplierTypeId is not null &&
                !await _db.SupplierTypes.AnyAsync(t => t.Id == dto.SupplierTypeId))
                return BadRequest(new ApiError($"Supplier type {dto.SupplierTypeId} does not exist."));

            var order = new PurchaseOrder
            {
                OrderNo = orderNo,
                OrderDate = dto.OrderDate,
                RequirementDate = dto.RequirementDate,
                SupplierId = dto.SupplierId,
                SupplierTypeId = dto.SupplierTypeId,
                Source = dto.Source,
                Status = dto.Status,
                IsUrgent = dto.IsUrgent,
                CreatedAt = DateTime.UtcNow,
                ReceiptImagePath = dto.ReceiptImagePath,
                ReceiptImage = dto.ReceiptImage,
                ReceiptImageContentType = dto.ReceiptImageContentType
            };

            foreach (var itemDto in dto.Items)
            {
                if (!await _db.Products.AnyAsync(p => p.Id == itemDto.ProductId))
                    return BadRequest(new ApiError($"Product {itemDto.ProductId} does not exist."));
                if (!await _db.Units.AnyAsync(u => u.Id == itemDto.UnitId))
                    return BadRequest(new ApiError($"Unit {itemDto.UnitId} does not exist."));

                order.Items.Add(new PurchaseOrderItem
                {
                    ProductId = itemDto.ProductId,
                    UnitId = itemDto.UnitId,
                    LastPurchasePrice = itemDto.LastPurchasePrice,
                    StockQty = itemDto.StockQty,
                    RequiredQty = itemDto.RequiredQty,
                    OrderQty = itemDto.OrderQty,
                    IsCancelled = itemDto.IsCancelled
                });
            }

            _db.PurchaseOrders.Add(order);
            await _db.SaveChangesAsync();

            await _db.Entry(order).Reference(o => o.Supplier).LoadAsync();
            if (order.SupplierTypeId is not null)
                await _db.Entry(order).Reference(o => o.SupplierType).LoadAsync();
            await _db.Entry(order).Collection(o => o.Items).Query()
                .Include(i => i.Product).Include(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id = order.Id }, ToDto(order));
        }

        // PUT api/purchaseorders/5 — update header fields (status, supplier type, etc).
        // Use the items endpoints below to add/edit/remove line items.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] PurchaseOrderUpdateDto dto)
        {
            var existing = await _db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id);
            if (existing is null) return NotFound();

            var hasInvoice = await _db.PurchaseInvoices.AnyAsync(p => p.PurchaseOrderId == id);
            if (dto.Status == PurchaseOrderStatus.Converted && existing.Status != PurchaseOrderStatus.Converted && !hasInvoice)
                return BadRequest(new ApiError("Purchase orders are converted automatically when a purchase invoice is created."));

            if (dto.SupplierTypeId is not null &&
                !await _db.SupplierTypes.AnyAsync(t => t.Id == dto.SupplierTypeId))
                return BadRequest(new ApiError($"Supplier type {dto.SupplierTypeId} does not exist."));

            existing.SupplierId = dto.SupplierId;
            existing.SupplierTypeId = dto.SupplierTypeId;
            existing.Source = dto.Source;
            if (hasInvoice)
                existing.Status = PurchaseOrderStatus.Converted;
            else if (existing.Status != PurchaseOrderStatus.Converted)
                existing.Status = dto.Status;
            existing.IsUrgent = dto.IsUrgent;
            existing.RequirementDate = dto.RequirementDate;

            // Receipt fields are optional on update — only overwrite when the
            // caller actually sends a value, so a PUT that omits them doesn't
            // wipe out a receipt attached earlier.
            if (dto.ReceiptImagePath is not null) existing.ReceiptImagePath = dto.ReceiptImagePath;
            if (dto.ReceiptImage is not null) existing.ReceiptImage = dto.ReceiptImage;
            if (dto.ReceiptImageContentType is not null) existing.ReceiptImageContentType = dto.ReceiptImageContentType;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST api/purchaseorders/5/receipt-image — upload/replace the
        // receipt image as an actual file (multipart/form-data). In Postman:
        // Body -> form-data -> key "file", type "File" -> pick an image.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost("{id:int}/receipt-image")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadReceiptImage(int id, IFormFile file)
        {
            var order = await _db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id);
            if (order is null) return NotFound(new ApiError($"Purchase order {id} not found."));

            if (file is null || file.Length == 0)
                return BadRequest(new ApiError("No file was uploaded. Send it as form-data with key 'file'."));

            string extension = Path.GetExtension(file.FileName);
            if (string.IsNullOrWhiteSpace(extension))
                extension = ".jpg";

            string[] allowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
            bool isAllowed = false;
            foreach (var allowedExtension in allowedExtensions)
            {
                if (string.Equals(extension, allowedExtension, StringComparison.OrdinalIgnoreCase))
                {
                    isAllowed = true;
                    break;
                }
            }
            if (!isAllowed)
                return BadRequest(new ApiError("Unsupported image type. Allowed: jpg, jpeg, png, gif, webp, bmp."));

            byte[] fileBytes;
            using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                fileBytes = ms.ToArray();
            }

            string folderPath = GetPurchaseOrderReceiptImagesFolderPath();
            string shortGuid = Guid.NewGuid().ToString("N").Substring(0, 8);
            string fileName = id + "_" + shortGuid + extension;
            string fullFilePath = Path.Combine(folderPath, fileName);

            await System.IO.File.WriteAllBytesAsync(fullFilePath, fileBytes);

            DeleteReceiptImageFile(order.ReceiptImagePath);

            order.ReceiptImage = null;
            order.ReceiptImageContentType = file.ContentType;
            order.ReceiptImagePath = "/" + PurchaseOrderReceiptImagesRelativeFolder + "/" + fileName;

            await _db.SaveChangesAsync();
            return Ok(new { order.Id, order.ReceiptImagePath });
        }
        [Authorize(Roles = "Admin,Manager")]
        [HttpDelete("{id:int}/receipt-image")]
        public async Task<IActionResult> DeleteReceiptImage(int id)
        {
            var order = await _db.PurchaseOrders.FirstOrDefaultAsync(o => o.Id == id);
            if (order is null) return NotFound(new ApiError($"Purchase order {id} not found."));

            DeleteReceiptImageFile(order.ReceiptImagePath);

            order.ReceiptImagePath = null;
            order.ReceiptImage = null;
            order.ReceiptImageContentType = null;

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // POST api/purchaseorders/5/items — append one line item to an existing order.
        [HttpPost("{id:int}/items")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<PurchaseOrderItemReadDto>> AddItem(int id, [FromBody] PurchaseOrderItemWriteDto dto)
        {
            if (!await _db.PurchaseOrders.AnyAsync(o => o.Id == id))
                return NotFound(new ApiError($"Purchase order {id} not found."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.ProductId))
                return BadRequest(new ApiError($"Product {dto.ProductId} does not exist."));
            if (!await _db.Units.AnyAsync(u => u.Id == dto.UnitId))
                return BadRequest(new ApiError($"Unit {dto.UnitId} does not exist."));

            var item = new PurchaseOrderItem
            {
                PurchaseOrderId = id,
                ProductId = dto.ProductId,
                UnitId = dto.UnitId,
                LastPurchasePrice = dto.LastPurchasePrice,
                StockQty = dto.StockQty,
                RequiredQty = dto.RequiredQty,
                OrderQty = dto.OrderQty,
                IsCancelled = dto.IsCancelled
            };

            _db.PurchaseOrderItems.Add(item);
            await _db.SaveChangesAsync();

            await _db.Entry(item).Reference(i => i.Product).LoadAsync();
            await _db.Entry(item).Reference(i => i.Unit).LoadAsync();

            return CreatedAtAction(nameof(GetById), new { id }, ItemToDto(item));
        }

        // PUT api/purchaseorders/5/items/12 — edit a single existing line item
        // (price, quantities, product/unit, cancelled flag). This is what the
        // Edit screen needs to persist a changed Last Purchase Price on a
        // saved line — Update() above only touches header fields.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}/items/{itemId:int}")]
        public async Task<ActionResult<PurchaseOrderItemReadDto>> UpdateItem(int id, int itemId, [FromBody] PurchaseOrderItemWriteDto dto)
        {
            var item = await _db.PurchaseOrderItems.FirstOrDefaultAsync(i => i.Id == itemId && i.PurchaseOrderId == id);
            if (item is null) return NotFound(new ApiError($"Item {itemId} not found on purchase order {id}."));

            if (!await _db.Products.AnyAsync(p => p.Id == dto.ProductId))
                return BadRequest(new ApiError($"Product {dto.ProductId} does not exist."));
            if (!await _db.Units.AnyAsync(u => u.Id == dto.UnitId))
                return BadRequest(new ApiError($"Unit {dto.UnitId} does not exist."));

            item.ProductId = dto.ProductId;
            item.UnitId = dto.UnitId;
            item.LastPurchasePrice = dto.LastPurchasePrice;
            item.StockQty = dto.StockQty;
            item.RequiredQty = dto.RequiredQty;
            item.OrderQty = dto.OrderQty;
            item.IsCancelled = dto.IsCancelled;

            await _db.SaveChangesAsync();

            await _db.Entry(item).Reference(i => i.Product).LoadAsync();
            await _db.Entry(item).Reference(i => i.Unit).LoadAsync();

            return Ok(ItemToDto(item));
        }

        // DELETE api/purchaseorders/5/items/12 — remove a single line item.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}/items/{itemId:int}")]
        public async Task<IActionResult> RemoveItem(int id, int itemId)
        {
            var item = await _db.PurchaseOrderItems.FirstOrDefaultAsync(i => i.Id == itemId && i.PurchaseOrderId == id);
            if (item is null) return NotFound();

            _db.PurchaseOrderItems.Remove(item);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/purchaseorders/5 — blocked once it's been converted into a purchase invoice.
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var order = await _db.PurchaseOrders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id);
            if (order is null) return NotFound();

            if (await _db.PurchaseInvoices.AnyAsync(p => p.PurchaseOrderId == id))
                return Conflict(new ApiError("Cannot delete an order that has already been converted to a purchase invoice."));

            _db.PurchaseOrderItems.RemoveRange(order.Items);
            _db.PurchaseOrders.Remove(order);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        internal static PurchaseOrderItemReadDto ItemToDto(PurchaseOrderItem i) => new()
        {
            Id = i.Id,
            ProductId = i.ProductId,
            ProductName = i.Product?.ProductName,
            UnitId = i.UnitId,
            UnitName = i.Unit?.Name,
            LastPurchasePrice = i.LastPurchasePrice,
            StockQty = i.StockQty,
            RequiredQty = i.RequiredQty,
            OrderQty = i.OrderQty,
            IsCancelled = i.IsCancelled
        };

        internal static PurchaseOrderReadDto ToDto(PurchaseOrder o) => new()
        {
            Id = o.Id,
            OrderNo = o.OrderNo,
            OrderDate = o.OrderDate,
            RequirementDate = o.RequirementDate,
            SupplierId = o.SupplierId,
            SupplierName = o.Supplier?.SupplierName,
            SupplierTypeId = o.SupplierTypeId,
            SupplierTypeName = o.SupplierType?.Name,
            Source = o.Source,
            Status = o.Status,
            IsUrgent = o.IsUrgent,
            CreatedAt = o.CreatedAt,
            ReceiptImagePath = o.ReceiptImagePath,
            ReceiptImage = o.ReceiptImage,
            ReceiptImageContentType = o.ReceiptImageContentType,
            Items = o.Items.Select(ItemToDto).ToList()
        };

        private async Task PopulateReceivingProgressAsync(PurchaseOrderReadDto order)
        {
            var receivedLines = await _db.PurchaseInvoiceItems
                .Where(i => i.PurchaseInvoice.PurchaseOrderId == order.Id)
                .GroupBy(i => new { i.ProductId, i.UnitId })
                .Select(g => new { g.Key.ProductId, g.Key.UnitId, Quantity = g.Sum(i => i.ReceivedQty) })
                .ToListAsync();
            var receivedByProductUnit = receivedLines.ToDictionary(
                x => (x.ProductId, x.UnitId), x => x.Quantity);

            foreach (var group in order.Items.OrderBy(i => i.Id).GroupBy(i => (i.ProductId, i.UnitId)))
            {
                receivedByProductUnit.TryGetValue(group.Key, out var unallocatedReceived);
                foreach (var item in group)
                {
                    if (item.IsCancelled)
                    {
                        item.PreviouslyReceivedQty = 0;
                        item.RemainingQty = 0;
                        continue;
                    }

                    var allocated = Math.Min(item.OrderQty, Math.Max(0, unallocatedReceived));
                    item.PreviouslyReceivedQty = allocated;
                    item.RemainingQty = Math.Max(0, item.OrderQty - allocated);
                    unallocatedReceived -= allocated;
                }
            }
        }
    }
}
