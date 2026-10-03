using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.People;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Controllers
{
    // The Supplier <-> Product many-to-many. Two ways to call GetAll:
    //   ?supplierId=7  -> every product this supplier carries (their catalogue)
    //   ?productId=12  -> every supplier this product can be bought from
    // Each link carries its own set of per-unit prices (Pcs/Box/Strip/...),
    // never falls back to the product's flat master price.
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SupplierProductsController : ControllerBase
    {
        private readonly PharmacyDbContext _db;

        public SupplierProductsController(PharmacyDbContext db)
        {
            _db = db;
        }

        private static SupplierProductReadDto MapToReadDto(SupplierProduct sp) => new()
        {
            Id = sp.Id,
            SupplierId = sp.SupplierId,
            SupplierName = sp.Supplier?.SupplierName ?? string.Empty,
            ProductId = sp.ProductId,
            ProductName = sp.Product?.ProductName ?? string.Empty,
            ProductStrength = sp.Product?.Strength,
            SupplierProductCode = sp.SupplierProductCode,
            IsPreferred = sp.IsPreferred,
            IsActive = sp.IsActive,
            LastPurchaseDate = sp.LastPurchaseDate,
            LastPurchaseUnitCost = sp.LastPurchaseUnitCost,
            LastPurchaseUnitId = sp.LastPurchaseUnitId,
            LastPurchaseUnitName = null, // filled by caller when unit is loaded; see GetAll/GetById
            Note = sp.Note,
            Prices = sp.Prices.Select(p => new SupplierProductPriceReadDto
            {
                Id = p.Id,
                UnitId = p.UnitId,
                UnitName = p.Unit?.Name ?? string.Empty,
                BaseQuantity = p.BaseQuantity,
                PurchasePrice = p.PurchasePrice,
                SalePrice = p.SalePrice,
                UnitPrice = p.UnitPrice,
                DistributorPrice = p.DistributorPrice,
                UpdatedAt = p.UpdatedAt
            }).OrderBy(p => p.UnitName).ToList()
        };

        private IQueryable<SupplierProduct> BaseQuery() => _db.SupplierProducts
            .Include(sp => sp.Supplier)
            .Include(sp => sp.Product)
            .Include(sp => sp.Prices).ThenInclude(p => p.Unit)
            .AsQueryable();

        // GET api/supplierproducts?supplierId=7
        // GET api/supplierproducts?productId=12
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SupplierProductReadDto>>> GetAll(
            [FromQuery] int? supplierId,
            [FromQuery] int? productId,
            [FromQuery] bool includeInactive = false)
        {
            if (supplierId is null && productId is null)
                return BadRequestResponse("Provide supplierId or productId.");

            var query = BaseQuery();

            if (supplierId is not null)
                query = query.Where(sp => sp.SupplierId == supplierId);

            if (productId is not null)
                query = query.Where(sp => sp.ProductId == productId);

            if (!includeInactive)
                query = query.Where(sp => sp.IsActive);

            var links = await query
                .OrderByDescending(sp => sp.IsPreferred)
                .ThenBy(sp => sp.Supplier.SupplierName)
                .ThenBy(sp => sp.Product.ProductName)
                .ToListAsync();

            var unitNames = await _db.Units.AsNoTracking().ToDictionaryAsync(u => u.Id, u => u.Name);

            var result = links.Select(sp =>
            {
                var dto = MapToReadDto(sp);
                if (sp.LastPurchaseUnitId is not null && unitNames.TryGetValue(sp.LastPurchaseUnitId.Value, out var uName))
                    dto.LastPurchaseUnitName = uName;
                return dto;
            });

            return Ok(result);
        }

        // GET api/supplierproducts/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<SupplierProductReadDto>> GetById(int id)
        {
            var sp = await BaseQuery().FirstOrDefaultAsync(x => x.Id == id);
            if (sp is null) return NotFoundResponse($"Supplier-product link {id} not found.");

            var dto = MapToReadDto(sp);
            if (sp.LastPurchaseUnitId is not null)
            {
                var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == sp.LastPurchaseUnitId);
                dto.LastPurchaseUnitName = unit?.Name;
            }
            return Ok(dto);
        }

        // POST api/supplierproducts — link a supplier to a product, optionally
        // seeding its per-unit prices in the same call.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPost]
        public async Task<ActionResult<SupplierProductReadDto>> Create([FromBody] SupplierProductWriteDto dto)
        {
            if (!await _db.Suppliers.AnyAsync(s => s.SupplierId == dto.SupplierId))
                return BadRequestResponse($"Supplier {dto.SupplierId} does not exist.");

            if (!await _db.Products.AnyAsync(p => p.Id == dto.ProductId))
                return BadRequestResponse($"Product {dto.ProductId} does not exist.");

            if (await _db.SupplierProducts.AnyAsync(sp => sp.SupplierId == dto.SupplierId && sp.ProductId == dto.ProductId))
                return ConflictResponse("This supplier is already linked to this product.");

            if (dto.Prices is { Count: > 0 })
            {
                var unitIds = dto.Prices.Select(p => p.UnitId).ToList();
                var validUnitCount = await _db.Units.CountAsync(u => unitIds.Contains(u.Id));
                if (validUnitCount != unitIds.Distinct().Count())
                    return BadRequestResponse("One or more units in Prices do not exist, or are duplicated.");
            }

            var link = new SupplierProduct
            {
                SupplierId = dto.SupplierId,
                ProductId = dto.ProductId,
                SupplierProductCode = dto.SupplierProductCode,
                IsPreferred = dto.IsPreferred,
                IsActive = dto.IsActive,
                Note = dto.Note
            };

            if (dto.Prices is { Count: > 0 })
            {
                foreach (var p in dto.Prices)
                {
                    link.Prices.Add(new SupplierProductPrice
                    {
                        UnitId = p.UnitId,
                        BaseQuantity = p.BaseQuantity,
                        PurchasePrice = p.PurchasePrice,
                        SalePrice = p.SalePrice,
                        UnitPrice = p.UnitPrice,
                        DistributorPrice = p.DistributorPrice
                    });

                    _db.Add(new ProductPriceHistory
                    {
                        ProductId = dto.ProductId,
                        SupplierId = dto.SupplierId,
                        UnitId = p.UnitId,
                        PriceType = "SupplierPurchase",
                        PreviousPrice = null,
                        NewPrice = p.PurchasePrice,
                        ChangedAt = DateTime.UtcNow
                    });
                }
            }

            _db.SupplierProducts.Add(link);
            await _db.SaveChangesAsync();

            var reloaded = await BaseQuery().FirstAsync(x => x.Id == link.Id);
            return CreatedAtAction(nameof(GetById), new { id = link.Id }, MapToReadDto(reloaded));
        }

        // PUT api/supplierproducts/5 — update link metadata and, when Prices
        // is provided, fully sync the per-unit price rows (same "sync"
        // convention ProductsController uses: matching Id = update, no Id =
        // insert, missing existing Id = delete), logging each purchase-price
        // change to ProductPriceHistory with SupplierId set.
        [Authorize(Roles = "Admin,Manager")]
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] SupplierProductWriteDto dto)
        {
            var link = await _db.SupplierProducts.Include(sp => sp.Prices)
                .FirstOrDefaultAsync(sp => sp.Id == id);
            if (link is null) return NotFoundResponse($"Supplier-product link {id} not found.");

            if (await _db.SupplierProducts.AnyAsync(sp => sp.SupplierId == dto.SupplierId && sp.ProductId == dto.ProductId && sp.Id != id))
                return ConflictResponse("This supplier is already linked to this product.");

            link.SupplierId = dto.SupplierId;
            link.ProductId = dto.ProductId;
            link.SupplierProductCode = dto.SupplierProductCode;
            link.IsPreferred = dto.IsPreferred;
            link.IsActive = dto.IsActive;
            link.Note = dto.Note;

            if (dto.Prices is not null)
            {
                var incomingIds = dto.Prices.Where(p => p.Id is not null).Select(p => p.Id!.Value).ToHashSet();
                var toRemove = link.Prices.Where(p => !incomingIds.Contains(p.Id)).ToList();
                foreach (var removed in toRemove)
                    _db.SupplierProductPrices.Remove(removed);

                foreach (var p in dto.Prices)
                {
                    var existing = p.Id is not null ? link.Prices.FirstOrDefault(x => x.Id == p.Id) : null;

                    if (existing is not null)
                    {
                        if (existing.PurchasePrice != p.PurchasePrice)
                        {
                            _db.Add(new ProductPriceHistory
                            {
                                ProductId = link.ProductId,
                                SupplierId = link.SupplierId,
                                UnitId = p.UnitId,
                                PriceType = "SupplierPurchase",
                                PreviousPrice = existing.PurchasePrice,
                                NewPrice = p.PurchasePrice,
                                ChangedAt = DateTime.UtcNow
                            });
                        }

                        existing.UnitId = p.UnitId;
                        existing.BaseQuantity = p.BaseQuantity;
                        existing.PurchasePrice = p.PurchasePrice;
                        existing.SalePrice = p.SalePrice;
                        existing.UnitPrice = p.UnitPrice;
                        existing.DistributorPrice = p.DistributorPrice;
                        existing.UpdatedAt = DateTime.UtcNow;
                    }
                    else
                    {
                        link.Prices.Add(new SupplierProductPrice
                        {
                            UnitId = p.UnitId,
                            BaseQuantity = p.BaseQuantity,
                            PurchasePrice = p.PurchasePrice,
                            SalePrice = p.SalePrice,
                            UnitPrice = p.UnitPrice,
                            DistributorPrice = p.DistributorPrice
                        });

                        _db.Add(new ProductPriceHistory
                        {
                            ProductId = link.ProductId,
                            SupplierId = link.SupplierId,
                            UnitId = p.UnitId,
                            PriceType = "SupplierPurchase",
                            PreviousPrice = null,
                            NewPrice = p.PurchasePrice,
                            ChangedAt = DateTime.UtcNow
                        });
                    }
                }
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE api/supplierproducts/5
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var link = await _db.SupplierProducts.FirstOrDefaultAsync(sp => sp.Id == id);
            if (link is null) return NotFoundResponse($"Supplier-product link {id} not found.");

            _db.SupplierProducts.Remove(link);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/supplierproducts/5/price-history — full price-change log
        // for this supplier+product, per unit, newest first.
        [HttpGet("{id:int}/price-history")]
        public async Task<ActionResult> GetPriceHistory(int id)
        {
            var link = await _db.SupplierProducts.AsNoTracking().FirstOrDefaultAsync(sp => sp.Id == id);
            if (link is null) return NotFoundResponse($"Supplier-product link {id} not found.");

            var history = await _db.ProductPriceHistories.AsNoTracking()
                .Include(h => h.Unit)
                .Where(h => h.ProductId == link.ProductId && h.SupplierId == link.SupplierId)
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new
                {
                    h.Id,
                    h.PriceType,
                    UnitName = h.Unit != null ? h.Unit.Name : null,
                    h.PreviousPrice,
                    h.NewPrice,
                    h.ChangedAt
                })
                .ToListAsync();

            return Ok(history);
        }

        private ActionResult BadRequestResponse(string message) => BadRequest(new ApiError(message));
        private ActionResult NotFoundResponse(string message) => NotFound(new ApiError(message));
        private ActionResult ConflictResponse(string message) => Conflict(new ApiError(message));
    }
}
