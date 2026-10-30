using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WaterWatch.Api.Data;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Tests;

public sealed class IncidentApiTests
{
    private static readonly object Valid = new
    {
        title = "Burst pipe", description = "Water is flowing from a broken pipe.",
        location = "Bloemfontein, Nelson Mandela Drive", latitude = -29.12, longitude = 26.21
    };

    [Fact]
    public async Task CreateThenGet_PersistsAndReturnsServerFields()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/incidents", Valid);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        var id = created.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, id);
        Assert.Equal("Reported", created.GetProperty("status").GetString());
        Assert.Equal(DateTimeKind.Utc, created.GetProperty("createdAtUtc").GetDateTime().Kind);
        // A fresh scope verifies a committed row, not an EF tracked entity.
        using (var scope = factory.Services.CreateScope())
            Assert.True(await scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().Incidents.AnyAsync(x => x.Id == id));
        var list = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/incidents");
        Assert.Single(list!);
        Assert.Equal(id, list![0].GetProperty("id").GetGuid());
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"title\":null,\"description\":null,\"location\":null}")]
    [InlineData("{\"title\":\"   \",\"description\":\"          \",\"location\":\"   \"}")]
    [InlineData("{\"title\":\"Leak\",\"description\":\"Broken water pipe\",\"location\":\"Welkom\",\"latitude\":91,\"longitude\":26}")]
    [InlineData("{\"title\":\"Leak\",\"description\":\"Broken water pipe\",\"location\":\"Welkom\",\"latitude\":-29}")]
    [InlineData("{invalid")]
    public async Task InvalidBody_Returns400_WithoutWriting(string json)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/incidents", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var scope = factory.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().Incidents.ToListAsync());
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=101")]
    [InlineData("?page=abc")]
    public async Task InvalidPagination_Returns400(string query)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/incidents" + query)).StatusCode);
    }

    [Fact]
    public async Task List_IsNewestFirstAndPaginated()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
            db.Incidents.AddRange(
                new Incident { Title = "Older", Description = "Older water leak", Location = "Welkom", CreatedAtUtc = DateTime.UtcNow.AddHours(-1) },
                new Incident { Title = "Newer", Description = "Newer water leak", Location = "Welkom" });
            await db.SaveChangesAsync();
        }
        var first = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/incidents?pageSize=1");
        var second = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>("/api/incidents?pageSize=1&page=2");
        Assert.Equal("Newer", Assert.Single(first!).GetProperty("title").GetString());
        Assert.Equal("Older", Assert.Single(second!).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Swagger_ContainsBothEndpoints()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var spec = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/swagger/v1/swagger.json");
        var path = spec.GetProperty("paths").GetProperty("/api/incidents");
        Assert.True(path.TryGetProperty("post", out _));
        Assert.True(path.TryGetProperty("get", out _));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/swagger/index.html")).StatusCode);
    }

    [Fact]
    public async Task UnreachablePostgres_ReturnsSanitized503()
    {
        using var factory = new ApiFactory(usePostgres: true);
        using var client = factory.CreateClient();
        foreach (var response in new[] { await client.GetAsync("/api/incidents"), await client.PostAsJsonAsync("/api/incidents", Valid) })
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Database unavailable", body);
            Assert.DoesNotContain("Password", body);
            Assert.DoesNotContain("Npgsql", body);
        }
    }
}

internal sealed class ApiFactory(bool usePostgres = false, string? postgresConnection = null, System.Data.Common.DbConnection? sharedConnection = null, System.Data.Common.DbTransaction? sharedTransaction = null, string? sensorCredential = null) : WebApplicationFactory<Program>
{
    public static readonly string OperatorKey = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    public static readonly string SensorKey = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", OperatorKey);
    }
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Operator:ApiKey", OperatorKey);
        builder.UseSetting("Operator:Identifier", "test-operator");
        builder.UseSetting("Telemetry:IngestionKey", sensorCredential ?? SensorKey);
        builder.UseSetting("ConnectionStrings:WaterWatch", postgresConnection ?? "Host=127.0.0.1;Port=1;Database=unreachable;Username=test;Timeout=1;Pooling=false");
        if (sharedConnection is not null)
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<WaterWatchDbContext>();
                services.AddScoped(_ => {
                    var db = new WaterWatchDbContext(new DbContextOptionsBuilder<WaterWatchDbContext>().UseNpgsql(sharedConnection).Options);
                    db.Database.UseTransaction(sharedTransaction);
                    return db;
                });
            });
            return;
        }
        if (usePostgres) return;
        connection.Open();
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<WaterWatchDbContext>>();
            services.RemoveAll<Microsoft.EntityFrameworkCore.Infrastructure.IDbContextOptionsConfiguration<WaterWatchDbContext>>();
            services.AddDbContext<WaterWatchDbContext>(options => options.UseSqlite(connection));
            using var provider = services.BuildServiceProvider();
            using var scope = provider.CreateScope();
            scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().Database.EnsureCreated();
        });
    }
    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) connection.Dispose();
    }
}


