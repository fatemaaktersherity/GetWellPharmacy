using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PharmacyV2.Data;
using PharmacyV2.DTOs;
using PharmacyV2.Models.Product;

namespace PharmacyV2.Controllers;

[Authorize]
[ApiController]
[Route("api/productcategories")]
public sealed class ProductCategoriesController : ControllerBase
{
    private readonly PharmacyDbContext _db;
    public ProductCategoriesController(PharmacyDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductCategoryReadDto>>> GetAll()
        => Ok(await _db.ProductCategories.AsNoTracking()
            .OrderBy(c => c.ParentCategoryId).ThenBy(c => c.Name)
            .Select(c => new ProductCategoryReadDto
            {
                Id = c.Id,
                Name = c.Name,
                ParentCategoryId = c.ParentCategoryId,
                ParentCategoryName = c.ParentCategory == null ? null : c.ParentCategory.Name
            }).ToListAsync());

    [Authorize(Roles = "Admin,Manager")]
    [HttpPost]
    public async Task<ActionResult<ProductCategoryReadDto>> Create(ProductCategoryWriteDto dto)
    {
        var name = dto.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new ApiError("Category name is required."));
        if (dto.ParentCategoryId is not null && !await _db.ProductCategories.AnyAsync(c => c.Id == dto.ParentCategoryId && c.ParentCategoryId == null))
            return BadRequest(new ApiError("Choose a top-level category as the parent."));
        if (await _db.ProductCategories.AnyAsync(c => c.ParentCategoryId == dto.ParentCategoryId && c.Name.ToLower() == name.ToLower()))
            return Conflict(new ApiError("A category with this name already exists at this level."));

        var category = new ProductCategory { Name = name, ParentCategoryId = dto.ParentCategoryId };
        _db.ProductCategories.Add(category);
        await _db.SaveChangesAsync();
        var parentName = dto.ParentCategoryId is null ? null : await _db.ProductCategories.Where(c => c.Id == dto.ParentCategoryId).Select(c => c.Name).FirstAsync();
        return Ok(new ProductCategoryReadDto { Id = category.Id, Name = category.Name, ParentCategoryId = category.ParentCategoryId, ParentCategoryName = parentName });
    }

    [Authorize(Roles = "Admin,Manager")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ProductCategoryWriteDto dto)
    {
        var category = await _db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id);
        if (category is null) return NotFound(new ApiError("Category not found."));
        var name = dto.Name.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new ApiError("Category name is required."));
        if (dto.ParentCategoryId == id) return BadRequest(new ApiError("A category cannot be its own parent."));
        if (dto.ParentCategoryId is not null && !await _db.ProductCategories.AnyAsync(c => c.Id == dto.ParentCategoryId && c.ParentCategoryId == null))
            return BadRequest(new ApiError("Choose a top-level category as the parent."));
        if (await _db.ProductCategories.AnyAsync(c => c.Id != id && c.ParentCategoryId == dto.ParentCategoryId && c.Name.ToLower() == name.ToLower()))
            return Conflict(new ApiError("A category with this name already exists at this level."));
        if (category.ParentCategoryId is null && dto.ParentCategoryId is not null && await _db.ProductCategories.AnyAsync(c => c.ParentCategoryId == id))
            return Conflict(new ApiError("Move or remove this category's subcategories before making it a subcategory."));
        category.Name = name;
        category.ParentCategoryId = dto.ParentCategoryId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var category = await _db.ProductCategories.FirstOrDefaultAsync(c => c.Id == id);
        if (category is null) return NotFound(new ApiError("Category not found."));
        if (await _db.ProductCategories.AnyAsync(c => c.ParentCategoryId == id))
            return Conflict(new ApiError("Remove this category's subcategories first."));
        if (await _db.ProductGroups.AnyAsync(g => g.CategoryId == id))
            return Conflict(new ApiError("Cannot delete a category assigned to a product group."));
        _db.ProductCategories.Remove(category);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
