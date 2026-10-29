using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaterWatch.Api.Data;

namespace WaterWatch.Api.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES")))
            Skip = "Set WATERWATCH_TEST_POSTGRES to a migrated PostgreSQL database to run the live persistence test.";
    }
}

public sealed class PostgresPersistenceTests
{
    [PostgresFact]
    public async Task Postgres_CreateThenGet_CommitsRow()
    {
        using var factory = new ApiFactory(true, Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES"));
        using var client = factory.CreateClient();
        Guid? createdId = null;
        try
        {
            var response = await client.PostAsJsonAsync("/api/incidents", new
            {
                title = "WaterWatch integration test", description = "Temporary report created by the PostgreSQL persistence test.",
                location = "Bloemfontein test location"
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var created = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            createdId = created.GetProperty("id").GetGuid();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
            Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", db.Database.ProviderName);
            Assert.True(await db.Incidents.AsNoTracking().AnyAsync(x => x.Id == createdId));
            var list = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/incidents?pageSize=100");
            Assert.Contains(list!, x => x.GetProperty("id").GetGuid() == createdId);
        }
        finally
        {
            if (createdId.HasValue)
            {
                using var scope = factory.Services.CreateScope();
                await scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().Incidents
                    .Where(x => x.Id == createdId).ExecuteDeleteAsync();
            }
        }
    }
}
