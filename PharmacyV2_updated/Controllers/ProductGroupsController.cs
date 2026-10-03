using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Controllers;

[Authorize]
[Route("api/productgroups")]
[ApiController]
public class ProductGroupsController : ControllerBase
{
    private readonly PharmacyDbContext _db;
    public ProductGroupsController(PharmacyDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductGroupReadDto>>> GetAll()
        => Ok(await _db.ProductGroups.AsNoTracking().OrderBy(g => g.Name).Select(g => new ProductGroupReadDto
        {
            Id = g.Id,
            Name = g.Name,
            GenericName = g.GenericName,
            CompanyId = g.CompanyId,
            CompanyName = g.Company != null ? g.Company.Name : null,
            CompanyDivisionId = g.CompanyDivisionId,
            CompanyDivisionName = g.CompanyDivision != null ? g.CompanyDivision.Name : null,
            CategoryId = g.CategoryId,
            CategoryName = g.Category != null ? g.Category.Name : null,
            ParentCategoryId = g.Category != null ? g.Category.ParentCategoryId : null,
            ParentCategoryName = g.Category != null && g.Category.ParentCategory != null ? g.Category.ParentCategory.Name : null,
            VariantCount = g.Variants.Count
        }).ToListAsync());

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductGroupDetailDto>> GetById(int id)
    {
        var group = await _db.ProductGroups.AsNoTracking().Where(g => g.Id == id)
            .Select(g => new ProductGroupDetailDto
            {
                Id = g.Id,
                Name = g.Name,
                GenericName = g.GenericName,
                CompanyId = g.CompanyId,
                CompanyName = g.Company != null ? g.Company.Name : null,
                CompanyDivisionId = g.CompanyDivisionId,
                CompanyDivisionName = g.CompanyDivision != null ? g.CompanyDivision.Name : null,
                CategoryId = g.CategoryId,
                CategoryName = g.Category != null ? g.Category.Name : null,
                ParentCategoryId = g.Category != null ? g.Category.ParentCategoryId : null,
                ParentCategoryName = g.Category != null && g.Category.ParentCategory != null ? g.Category.ParentCategory.Name : null,
                VariantCount = g.Variants.Count,
                Variants = g.Variants.OrderBy(v => v.Strength).Select(v => new ProductVariantReadDto
                {
                    Id = v.Id,
                    ProductGroupId = v.ProductGroupId,
                    Strength = v.Strength,
                    DosageFormId = v.DosageFormId,
                    DosageFormName = v.DosageForm.Name
                }).ToList()
            }).FirstOrDefaultAsync();
        return group is null ? NotFound(new ApiError($"Product group {id} not found.")) : Ok(group);
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPost]
    public async Task<ActionResult<ProductGroupReadDto>> Create(ProductGroupWriteDto dto)
    {
        if (await _db.ProductGroups.AnyAsync(g => g.Name == dto.Name)) return Conflict(new ApiError("A product group with this name already exists."));
        if (dto.CompanyId is not null && !await _db.Companies.AnyAsync(c => c.Id == dto.CompanyId)) return BadRequest(new ApiError("Selected company does not exist."));
        if (!await IsDivisionValidAsync(dto.CompanyId, dto.CompanyDivisionId)) return BadRequest(new ApiError("Selected division must belong to the selected company."));
        if (!await IsCategoryValidAsync(dto.CategoryId)) return BadRequest(new ApiError("Selected category does not exist."));
        var group = new ProductGroup { Name = dto.Name.Trim(), GenericName = dto.GenericName?.Trim(), CompanyId = dto.CompanyId, CompanyDivisionId = dto.CompanyDivisionId, CategoryId = dto.CategoryId };
        _db.ProductGroups.Add(group); await _db.SaveChangesAsync();
        await _db.Entry(group).Reference(g => g.Company).LoadAsync();
        await _db.Entry(group).Reference(g => g.CompanyDivision).LoadAsync();
        await _db.Entry(group).Reference(g => g.Category).LoadAsync();
        if (group.Category is not null) await _db.Entry(group.Category).Reference(c => c.ParentCategory).LoadAsync();
        return CreatedAtAction(nameof(GetById), new { id = group.Id }, ToRead(group));
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ProductGroupWriteDto dto)
    {
        var group = await _db.ProductGroups.FindAsync(id);
        if (group is null) return NotFound(new ApiError($"Product group {id} not found."));
        if (await _db.ProductGroups.AnyAsync(g => g.Name == dto.Name && g.Id != id)) return Conflict(new ApiError("A product group with this name already exists."));
        if (dto.CompanyId is not null && !await _db.Companies.AnyAsync(c => c.Id == dto.CompanyId)) return BadRequest(new ApiError("Selected company does not exist."));
        if (!await IsDivisionValidAsync(dto.CompanyId, dto.CompanyDivisionId)) return BadRequest(new ApiError("Selected division must belong to the selected company."));
        if (!await IsCategoryValidAsync(dto.CategoryId)) return BadRequest(new ApiError("Selected category does not exist."));
        group.Name = dto.Name.Trim(); group.GenericName = dto.GenericName?.Trim(); group.CompanyId = dto.CompanyId; group.CompanyDivisionId = dto.CompanyDivisionId; group.CategoryId = dto.CategoryId;
        await _db.SaveChangesAsync(); return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var group = await _db.ProductGroups.Include(g => g.Variants).FirstOrDefaultAsync(g => g.Id == id);
        if (group is null) return NotFound(new ApiError($"Product group {id} not found."));
        if (await _db.Products.AnyAsync(p => p.ProductVariant != null && p.ProductVariant.ProductGroupId == id))
            return Conflict(new ApiError("This group has variants already used by products."));
        _db.ProductGroups.Remove(group); await _db.SaveChangesAsync(); return NoContent();
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPost("{groupId:int}/variants")]
    public async Task<ActionResult<ProductVariantReadDto>> CreateVariant(int groupId, ProductVariantWriteDto dto)
    {
        if (!await _db.ProductGroups.AnyAsync(g => g.Id == groupId)) return NotFound(new ApiError($"Product group {groupId} not found."));
        if (!await _db.DosageForms.AnyAsync(d => d.Id == dto.DosageFormId)) return BadRequest(new ApiError("Selected dosage form does not exist."));
        if (await _db.ProductVariants.AnyAsync(v => v.ProductGroupId == groupId && v.Strength == dto.Strength && v.DosageFormId == dto.DosageFormId)) return Conflict(new ApiError("This strength and dosage form already exists in the group."));
        var variant = new ProductVariant { ProductGroupId = groupId, Strength = dto.Strength.Trim(), DosageFormId = dto.DosageFormId };
        _db.ProductVariants.Add(variant); await _db.SaveChangesAsync(); await _db.Entry(variant).Reference(v => v.DosageForm).LoadAsync();
        return CreatedAtAction(nameof(GetById), new { id = groupId }, ToVariant(variant));
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPut("{groupId:int}/variants/{id:int}")]
    public async Task<IActionResult> UpdateVariant(int groupId, int id, ProductVariantWriteDto dto)
    {
        var variant = await _db.ProductVariants.FirstOrDefaultAsync(v => v.Id == id && v.ProductGroupId == groupId);
        if (variant is null) return NotFound(new ApiError("Product variant not found."));
        if (!await _db.DosageForms.AnyAsync(d => d.Id == dto.DosageFormId)) return BadRequest(new ApiError("Selected dosage form does not exist."));
        if (await _db.ProductVariants.AnyAsync(v => v.Id != id && v.ProductGroupId == groupId && v.Strength == dto.Strength && v.DosageFormId == dto.DosageFormId)) return Conflict(new ApiError("This strength and dosage form already exists in the group."));
        variant.Strength = dto.Strength.Trim(); variant.DosageFormId = dto.DosageFormId; await _db.SaveChangesAsync(); return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{groupId:int}/variants/{id:int}")]
    public async Task<IActionResult> DeleteVariant(int groupId, int id)
    {
        var variant = await _db.ProductVariants.Include(v => v.Products).FirstOrDefaultAsync(v => v.Id == id && v.ProductGroupId == groupId);
        if (variant is null) return NotFound(new ApiError("Product variant not found."));
        if (variant.Products.Any()) return Conflict(new ApiError("Cannot delete a variant used by products."));
        _db.ProductVariants.Remove(variant); await _db.SaveChangesAsync(); return NoContent();
    }

    private async Task<bool> IsDivisionValidAsync(int? companyId, int? divisionId)
    {
        if (divisionId is null) return true;
        if (companyId is null) return false;
        return await _db.CompanyDivisions.AnyAsync(d => d.Id == divisionId && d.CompanyId == companyId);
    }

    private Task<bool> IsCategoryValidAsync(int? categoryId) => categoryId is null
        ? Task.FromResult(true)
        : _db.ProductCategories.AnyAsync(c => c.Id == categoryId);

    private static ProductGroupReadDto ToRead(ProductGroup g) => new() { Id = g.Id, Name = g.Name, GenericName = g.GenericName, CompanyId = g.CompanyId, CompanyName = g.Company?.Name, CompanyDivisionId = g.CompanyDivisionId, CompanyDivisionName = g.CompanyDivision?.Name, CategoryId = g.CategoryId, CategoryName = g.Category?.Name, ParentCategoryId = g.Category?.ParentCategoryId, ParentCategoryName = g.Category?.ParentCategory?.Name, VariantCount = g.Variants.Count };
    private static ProductVariantReadDto ToVariant(ProductVariant v) => new() { Id = v.Id, ProductGroupId = v.ProductGroupId, Strength = v.Strength, DosageFormId = v.DosageFormId, DosageFormName = v.DosageForm.Name };
}
